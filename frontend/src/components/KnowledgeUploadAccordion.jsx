import { useState } from "react";
import AccordionBox from "./AccordionBox";
import FileUpload from "./FileUpload";

export default function KnowledgeUploadAccordion({
  usage,
  summaryStatus,
  isSummarizing,
  onSummarize,
}) {
  const [isUploadExpanded, setIsUploadExpanded] = useState(false);

  const handleSummarize = async (file) => {
    setIsUploadExpanded(true);
    await onSummarize(file);
    setIsUploadExpanded(false);
  };

  return (
    <AccordionBox
      title="새로운 지식 추가"
      expanded={isUploadExpanded || isSummarizing}
      disableToggle={isSummarizing}
      onExpandedChange={(next) => {
        if (isSummarizing) return;
        setIsUploadExpanded(next);
      }}
      className={`knowledge-upload-accordion${
        isSummarizing ? " knowledge-upload-accordion--loading" : ""
      }`}
    >
      <FileUpload
        usage={usage}
        embedded
        isRunning={isSummarizing}
        progress={summaryStatus.progress}
        message={summaryStatus.message}
        error={summaryStatus.error}
        phase={summaryStatus.phase}
        onSummarize={handleSummarize}
      />
    </AccordionBox>
  );
}
