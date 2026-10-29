import logging
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db, utcnow
from ..demo import create_demo_data
from ..models import OnboardingSession, PasswordReset, Profile, RefreshSession, User
from ..schemas import ForgotIn, LoginIn, RefreshIn, RegisterIn, ResetIn, TokenOut, UserOut
from ..security import (DUMMY_HASH, AuthError, audit, client_ip, current_user, hash_password, make_access_token,
                        new_opaque_token, platform_of, rate_limit, sha256, verify_password)

router = APIRouter(prefix="/auth", tags=["auth"])
log = logging.getLogger("aurel.auth")
COOKIE = "aurel_refresh"

# Dev-only mail outbox. Replace with a real email provider (docs/integrations.md). Tests read from it.
DEV_OUTBOX: list[dict] = []




def _issue(db: Session, user: User, platform: str, response: Response) -> tuple[TokenOut, RefreshSession]:
    s = get_settings()
    raw = new_opaque_token()
    sess = RefreshSession(user_id=user.id, token_hash=sha256(raw), platform=platform,
                          expires_at=utcnow() + timedelta(days=s.refresh_token_days))
    db.add(sess)
    db.flush()
    out = TokenOut(access_token=make_access_token(user, sess.id), expires_in=s.access_token_minutes * 60,
                   user=UserOut.model_validate(user))
    if platform == "web":
        # Web never sees the refresh token: httpOnly, same-origin (via Next.js proxy), strict same-site.
        response.set_cookie(COOKIE, raw, httponly=True, secure=s.is_production, samesite="strict",
                            path=s.refresh_cookie_path, max_age=s.refresh_token_days * 86400)
    else:
        out.refresh_token = raw
    return out, sess


@router.post("/register", response_model=TokenOut, status_code=201)
def register(body: RegisterIn, request: Request, response: Response, db: Session = Depends(get_db),
             platform: str = Depends(platform_of)):
    rate_limit(f"register:{client_ip(request)}", 10, 3600)
    email = body.email.lower()
    user = User(email=email, password_hash=hash_password(body.password))
    user.profile = Profile(first_name=body.first_name.strip(), last_name=body.last_name.strip(), updated_from=platform)
    user.onboarding = OnboardingSession(last_platform=platform)
    db.add(user)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        # ponytail: reveals that the email exists; acceptable for a prototype. Production: always "check your email" flow.
        raise HTTPException(409, {"code": "email_taken", "message": "An account with this email already exists. Try signing in."})
    if get_settings().demo_data_on_signup:
        create_demo_data(db, user)
    audit(db, user.id, "auth.register", "user", user.id, platform)
    out, _ = _issue(db, user, platform, response)
    db.commit()
    return out


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db),
          platform: str = Depends(platform_of)):
    email = body.email.lower()
    rate_limit(f"login:{client_ip(request)}", 20, 60)
    rate_limit(f"login:{email}", 8, 300)
    user = db.scalar(select(User).where(User.email == email))
    ok = verify_password(body.password, user.password_hash if user else DUMMY_HASH)
    if not user or not ok or not user.is_active:
        audit(db, user.id if user else None, "auth.login_failed", platform=platform)
        db.commit()
        raise HTTPException(401, {"code": "invalid_credentials", "message": "Email or password is incorrect."})
    audit(db, user.id, "auth.login", "user", user.id, platform)
    out, _ = _issue(db, user, platform, response)
    db.commit()
    return out


@router.post("/refresh", response_model=TokenOut)
def refresh(request: Request, response: Response, body: RefreshIn | None = None, db: Session = Depends(get_db),
            platform: str = Depends(platform_of)):
    raw = (body.refresh_token if body else None) or request.cookies.get(COOKIE)
    if not raw:
        raise AuthError()
    sess = db.scalar(select(RefreshSession).where(RefreshSession.token_hash == sha256(raw)))
    now = utcnow()
    if not sess:
        raise AuthError()
    successor = db.get(RefreshSession, sess.replaced_by) if sess.replaced_by else None
    # The grace window covers concurrent refreshes only. Once the successor was explicitly ended (logout,
    # logout-all, password reset), the rotated token must not be able to start a fresh session.
    in_grace = (successor is not None and not (successor.revoked_at and not successor.replaced_by)
                and (now - sess.revoked_at).total_seconds() < get_settings().refresh_reuse_grace_seconds)
    if sess.revoked_at and not in_grace:
        if sess.replaced_by:
            # A rotated token was replayed: assume theft and end every session for this user.
            db.execute(update(RefreshSession).where(RefreshSession.user_id == sess.user_id,
                                                    RefreshSession.revoked_at.is_(None)).values(revoked_at=now))
            audit(db, sess.user_id, "auth.refresh_reuse_detected", platform=platform)
            db.commit()
        raise AuthError("session_expired", "Your session has ended. Please sign in again.")
    user = db.get(User, sess.user_id)
    if sess.expires_at < now or not user or not user.is_active:
        raise AuthError("session_expired", "Your session has expired. Please sign in again.")
    out, new_sess = _issue(db, user, sess.platform if sess.platform != "unknown" else platform, response)
    if not sess.revoked_at:
        sess.revoked_at = now
        sess.replaced_by = new_sess.id
    db.commit()
    return out


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, user: User = Depends(current_user), db: Session = Depends(get_db),
           platform: str = Depends(platform_of)):
    db.get(RefreshSession, request.state.session_id).revoked_at = utcnow()
    audit(db, user.id, "auth.logout", platform=platform)
    db.commit()
    response.delete_cookie(COOKIE, path=get_settings().refresh_cookie_path)


@router.post("/logout-all", status_code=204)
def logout_all(response: Response, user: User = Depends(current_user), db: Session = Depends(get_db),
               platform: str = Depends(platform_of)):
    db.execute(update(RefreshSession).where(RefreshSession.user_id == user.id, RefreshSession.revoked_at.is_(None))
               .values(revoked_at=utcnow()))
    audit(db, user.id, "auth.logout_all", platform=platform)
    db.commit()
    response.delete_cookie(COOKIE, path=get_settings().refresh_cookie_path)


@router.post("/forgot-password", status_code=202)
def forgot(body: ForgotIn, request: Request, db: Session = Depends(get_db)):
    rate_limit(f"forgot:{client_ip(request)}", 5, 900)
    user = db.scalar(select(User).where(User.email == body.email.lower(), User.is_active.is_(True)))
    if user:
        raw = new_opaque_token()
        s = get_settings()
        db.add(PasswordReset(user_id=user.id, token_hash=sha256(raw),
                             expires_at=utcnow() + timedelta(minutes=s.reset_token_minutes)))
        audit(db, user.id, "auth.password_reset_requested")
        db.commit()
        link = f"{s.web_base_url}/reset-password?token={raw}"
        if not s.is_production:
            DEV_OUTBOX.append({"to": user.email, "link": link, "token": raw})
            log.warning("DEV EMAIL OUTBOX -> password reset link for %s: %s", user.email, link)
    # Same response whether or not the account exists.
    return {"message": "If an account exists for that email, a reset link has been sent."}


@router.post("/reset-password", status_code=204)
def reset(body: ResetIn, request: Request, db: Session = Depends(get_db)):
    rate_limit(f"reset:{client_ip(request)}", 10, 900)
    pr = db.scalar(select(PasswordReset).where(PasswordReset.token_hash == sha256(body.token)))
    now = utcnow()
    if not pr or pr.used_at or pr.expires_at < now:
        raise HTTPException(400, {"code": "invalid_token", "message": "This reset link is invalid or has expired."})
    user = db.get(User, pr.user_id)
    user.password_hash = hash_password(body.password)
    pr.used_at = now
    db.execute(update(RefreshSession).where(RefreshSession.user_id == user.id, RefreshSession.revoked_at.is_(None))
               .values(revoked_at=now))
    audit(db, user.id, "auth.password_reset")
    db.commit()
