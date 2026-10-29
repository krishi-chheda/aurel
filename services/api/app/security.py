import hashlib
import ipaddress
import secrets
import time
from collections import defaultdict, deque
from datetime import timedelta

import bcrypt
import jwt
from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db, utcnow
from .models import PLATFORMS, AuditEvent, RefreshSession, User

ALGO = "HS256"


BCRYPT_MAX_BYTES = 72  # bcrypt ignores everything after 72 bytes, so longer passwords are refused, not truncated (AUD-18)


def hash_password(pw: str) -> str:
    raw = pw.encode()
    if len(raw) > BCRYPT_MAX_BYTES:
        raise ValueError("password longer than 72 bytes")
    return bcrypt.hashpw(raw, bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    raw = pw.encode()
    # Still run bcrypt on over-long input (constant-ish timing), but never accept it: "stored password + extra
    # characters" would otherwise match after truncation.
    ok = bcrypt.checkpw(raw[:BCRYPT_MAX_BYTES], hashed.encode())
    return ok and len(raw) <= BCRYPT_MAX_BYTES


# Pre-computed so unknown-email logins cost the same as wrong-password logins (no user enumeration via timing).
DUMMY_HASH = hash_password(secrets.token_hex(8))


def sha256(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_opaque_token() -> str:
    return secrets.token_urlsafe(32)


def make_access_token(user: User, session_id: str) -> str:
    s = get_settings()
    now = utcnow()
    payload = {"sub": user.id, "role": user.role, "sid": session_id, "iat": now,
               "exp": now + timedelta(minutes=s.access_token_minutes), "typ": "access"}
    return jwt.encode(payload, s.jwt_secret, algorithm=ALGO)


def platform_of(x_client_platform: str | None = Header(default=None)) -> str:
    return x_client_platform if x_client_platform in PLATFORMS else "unknown"


class AuthError(HTTPException):
    def __init__(self, code: str = "unauthenticated", message: str = "Please sign in again."):
        super().__init__(status_code=401, detail={"code": code, "message": message})


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        raise AuthError()
    try:
        claims = jwt.decode(auth[7:], get_settings().jwt_secret, algorithms=[ALGO])
    except jwt.ExpiredSignatureError:
        raise AuthError("session_expired", "Your session has expired. Please sign in again.")
    except jwt.InvalidTokenError:
        raise AuthError()
    if claims.get("typ") != "access":
        raise AuthError()
    # Checking the session row makes logout / password reset take effect immediately, not at token expiry.
    sess = db.get(RefreshSession, claims.get("sid"))
    user = db.get(User, claims.get("sub"))
    if not user or not user.is_active or not sess or sess.revoked_at or sess.user_id != user.id:
        raise AuthError("session_expired", "Your session has ended. Please sign in again.")
    request.state.session_id = sess.id
    return user


def require_role(*roles: str):
    def dep(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(403, {"code": "forbidden", "message": "You do not have access to this resource."})
        return user
    return dep


def audit(db: Session, actor_id: str | None, action: str, target_type: str | None = None,
          target_id: str | None = None, platform: str = "unknown", **meta) -> None:
    db.add(AuditEvent(actor_id=actor_id, action=action, target_type=target_type,
                      target_id=target_id, platform=platform, meta=meta))


def _ip(value: str):
    try:
        return ipaddress.ip_address(value.strip().strip("[]"))
    except ValueError:
        return None


def client_ip(request: Request) -> str:
    """The address rate limits are keyed on. X-Forwarded-For is only believed when the connection itself comes from a
    configured trusted proxy; the chain is then walked right to left, skipping trusted hops, and the first untrusted
    address is the client. A browser-supplied header is never trusted on its own (AUD-09)."""
    nets = [ipaddress.ip_network(n.strip(), strict=False) for n in get_settings().trusted_proxies.split(",") if n.strip()]
    trusted = lambda a: a is not None and any(a in n for n in nets)  # noqa: E731
    peer = request.client.host if request.client else "unknown"
    if not trusted(_ip(peer)):
        return peer
    for hop in reversed(request.headers.get("x-forwarded-for", "").split(",")):
        addr = _ip(hop)
        if addr is None:
            break  # malformed chain: stop believing it
        if not trusted(addr):
            return str(addr)
    return peer


# ponytail: in-process sliding window; per-instance only. Use Redis (or the gateway) when running >1 API instance.
_hits: dict[str, deque] = defaultdict(deque)


def rate_limit(key: str, limit: int, window_s: int) -> None:
    if not get_settings().rate_limit_enabled:
        return
    now = time.monotonic()
    q = _hits[key]
    while q and now - q[0] > window_s:
        q.popleft()
    if len(q) >= limit:
        raise HTTPException(429, {"code": "rate_limited", "message": "Too many attempts. Please wait a minute and try again."})
    q.append(now)
