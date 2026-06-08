import { useState } from "react";
import AccordionBox from "./AccordionBox";
import FileUpload from "./FileUpload";

export default function KnowledgeUploadAccordion({
  userId,
  usage,
  onUsageRefresh,
  onQuotaExhausted,
  onUploaded,
}) {
  const [isUploadExpanded, setIsUploadExpanded] = useState(false);

  const handleUploadStarted = () => {
    setIsUploadExpanded(false);
  };

  return (
    <AccordionBox
      title="새로운 지식 추가"
      expanded={isUploadExpanded}
      onExpandedChange={setIsUploadExpanded}
      className="knowledge-upload-accordion"
    >
      <FileUpload
        userId={userId}
        usage={usage}
        embedded
        onUsageRefresh={onUsageRefresh}
        onQuotaExhausted={onQuotaExhausted}
        onUploaded={onUploaded}
        onUploadStarted={handleUploadStarted}
      />
    </AccordionBox>
  );
}
