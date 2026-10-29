import { formatDate } from "@aurel/shared";
import { View } from "react-native";

import { TaskRow } from "@/components/task-row";
import { Card, CardTitle, EmptyState, LoadError, Loading, Notice, ProgressBar, Screen, SyncStatus, Text } from "@/components/ui";
import { api } from "@/lib/session";
import { useResource } from "@/lib/use-resource";

export default function CarePlan() {
  const plan = useResource(() => api.carePlan());
  const other = useResource(() => api.tasks("open"));
  const p = plan.data;
  if (p === undefined) return plan.error ? <Screen><LoadError error={plan.error} onRetry={plan.reload} /></Screen> : <Loading />;
  if (p === null) return <Screen><EmptyState title="No care plan yet" body="Your clinician creates your plan after your results review." /></Screen>;

  const refresh = () => { plan.reload(); other.reload(); };
  const open = p.tasks.filter((t) => t.status === "open");
  const done = p.tasks.filter((t) => t.status === "done");
  const general = (other.data ?? []).filter((t) => !t.care_plan_id);

  return (
    <Screen refreshing={plan.refreshing} onRefresh={refresh}>
      <View style={{ gap: 4 }}>
        <Text variant="title">{p.title}</Text>
        <Text variant="muted">Approved {formatDate(p.approved_at)} by {p.approved_by}</Text>
        <SyncStatus state={plan.state} syncedAt={plan.syncedAt} onRetry={refresh} />
      </View>
      <Notice tone="info">{p.disclaimer}</Notice>
      <Card>
        <CardTitle title="Progress" />
        <Text variant="title">{p.progress.percent}%</Text>
        <ProgressBar value={p.progress.percent} label="Plan progress" />
        <Text variant="muted">{p.progress.done} of {p.progress.total} actions complete</Text>
      </Card>
      <Card>
        <CardTitle title="Goals" />
        {p.goals.map((g, i) => (
          <View key={g.title} style={{ flexDirection: "row", gap: 12 }}>
            <Text variant="title" color="primary">{i + 1}</Text>
            <View style={{ flex: 1 }}><Text style={{ fontWeight: "500" }}>{g.title}</Text><Text variant="muted">{g.detail}</Text></View>
          </View>
        ))}
      </Card>
      <Card>
        <CardTitle title="Actions and milestones" sub="Tick these off here or on the web." />
        {open.length ? open.map((t) => <TaskRow key={t.id} task={t} onChange={refresh} />) : <EmptyState title="Nothing outstanding" />}
      </Card>
      {general.length > 0 && (
        <Card>
          <CardTitle title="Other tasks" />
          {general.map((t) => <TaskRow key={t.id} task={t} onChange={refresh} />)}
        </Card>
      )}
      <Card>
        <CardTitle title="Completed" />
        {done.length ? done.map((t) => <TaskRow key={t.id} task={t} onChange={refresh} />) : <EmptyState title="Nothing completed yet" />}
      </Card>
    </Screen>
  );
}
