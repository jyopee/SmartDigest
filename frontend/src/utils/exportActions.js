import html2canvas from "html2canvas";

function sanitizeFilename(name) {
  return (name || "smartdigest-export")
    .replace(/[<>:"/\\|?*]+/g, "-")
    .trim();
}

function triggerDownload(href, filename) {
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.click();
}

export async function exportElementAsImage(element, filename) {
  if (!element) throw new Error("보낼 영역을 찾을 수 없습니다.");

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
  });

  triggerDownload(
    canvas.toDataURL("image/png"),
    `${sanitizeFilename(filename)}.png`
  );
}

export async function exportElementAsPdf(element, filename) {
  if (!element) throw new Error("보낼 영역을 찾을 수 없습니다.");

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
  });

  const dataUrl = canvas.toDataURL("image/png");
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    throw new Error("팝업이 차단되어 PDF 저장을 시작할 수 없습니다.");
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${sanitizeFilename(filename)}</title>
        <style>
          body { margin: 0; padding: 16px; }
          img { width: 100%; height: auto; display: block; }
          @page { margin: 12mm; }
        </style>
      </head>
      <body>
        <img src="${dataUrl}" alt="export" />
        <script>
          window.onload = () => {
            window.focus();
            window.print();
          };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

export async function shareExportContent({ title, text, url }) {
  const payload = {
    title: title || "SmartDigest",
    text: text || "",
    url: url || window.location.href,
  };

  if (navigator.share) {
    await navigator.share(payload);
    return;
  }

  const shareText = [payload.title, payload.text, payload.url]
    .filter(Boolean)
    .join("\n\n");

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(shareText);
    alert("공유 내용이 클립보드에 복사되었습니다.");
    return;
  }

  throw new Error("이 브라우저에서는 공유 기능을 사용할 수 없습니다.");
}

export function buildNotesShareText(notes, filename) {
  const body = (notes || [])
    .map(
      (note) =>
        `### p.${note.page_number || 1}\n> ${note.selected_text || ""}\n\n${note.content || ""}`
    )
    .join("\n\n---\n\n");

  return {
    title: `${filename} — 주석 목록`,
    text: body || "주석이 없습니다.",
  };
}

export function buildChatsShareText(chats, filename) {
  const body = (chats || [])
    .map(
      (chat) =>
        `### p.${chat.page_number || 1}\n**Q.** ${chat.question}\n\n**A.** ${chat.answer || ""}`
    )
    .join("\n\n---\n\n");

  return {
    title: `${filename} — 질문 목록`,
    text: body || "질문 기록이 없습니다.",
  };
}
