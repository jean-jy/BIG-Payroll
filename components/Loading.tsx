export default function Loading({ text = "Loading..." }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-8 h-8 rounded-full border-2 border-[#1E2D4A] border-t-teal-400 animate-spin" />
      <p className="text-sm text-[#7B91BC]">{text}</p>
    </div>
  );
}
