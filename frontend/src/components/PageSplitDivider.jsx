export default function PageSplitDivider({ lineIndex, onMerge }) {
  const handleMerge = (event) => {
    event.preventDefault();
    event.stopPropagation();
    onMerge?.(lineIndex);
  };

  return (
    <button
      type="button"
      className="page-split-hr"
      role="separator"
      aria-label={`${lineIndex + 1}번째 줄 뒤 페이지 구분`}
      title="클릭하여 구간 합치기"
      onClick={handleMerge}
      onContextMenu={handleMerge}
    />
  );
}
