import { listFulfillmentRepairIssues } from "../src/lib/store";

const issues = await listFulfillmentRepairIssues();
const byType = new Map<string, number>();
for (const issue of issues) {
  for (const type of issue.issueTypes) byType.set(type, (byType.get(type) || 0) + 1);
}

console.log(
  JSON.stringify(
    {
      needsPrintfulRepair: issues.length > 0,
      count: issues.length,
      byType: Object.fromEntries([...byType.entries()].sort(([a], [b]) => a.localeCompare(b))),
      issues
    },
    null,
    2
  )
);

process.exit(issues.length > 0 ? 1 : 0);
