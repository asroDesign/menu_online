/** Flatten the payroll detail query into the Run shape consumed by the dashboard. */
export function flattenPayrollRun<T extends { run: Record<string, unknown> }>(data: T) {
  const { run, ...details } = data;
  return { ...run, ...details };
}
