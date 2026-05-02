export const MONTHS = Array.from({ length: 24 }, (_, i) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - i);
  const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const label = d.toLocaleDateString("en-MY", { month: "long", year: "numeric" });
  return { label, value };
});
