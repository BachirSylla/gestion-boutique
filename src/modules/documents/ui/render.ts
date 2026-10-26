"use client";

// Rendu des documents sur l'appareil (fonctionne hors ligne) : reçu en image, relevé en PDF.
// Les textes arrivent déjà traduits et formatés : ce module ne fait que la mise en page.
import { pdfText } from "../domain/documents";

const COLORS = {
  green: "#0E5A3A",
  greenSoft: "#E3F1E9",
  ink: "#10231B",
  grey: "#5B6B63",
  border: "#D5DED8",
  brick: "#9A3412",
  positive: "#0E6B44",
};

export interface ReceiptView {
  shopName: string;
  shopDetails: string;
  title: string;
  dateLine: string;
  customerLine: string;
  lines: { left: string; right: string }[];
  note: string | null;
  totalLabel: string;
  total: string;
  balances: { label: string; value: string; tone: "debt" | "advance" | "neutral" }[];
  dueLine: string | null;
  footerLines: string[];
}

/** Reçu au format téléphone (image PNG), lisible directement dans WhatsApp. */
export async function renderReceiptPng(view: ReceiptView): Promise<Blob> {
  await document.fonts?.ready;
  const scale = 2;
  const width = 360;
  const padding = 20;
  const font = getComputedStyle(document.body).fontFamily || "sans-serif";
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;

  // Hauteur : calculée en simulant le dessin.
  const wrap = (text: string, size: number, weight: number, max: number): string[] => {
    ctx.font = `${weight} ${size}px ${font}`;
    const words = text.split(" ");
    const out: string[] = [];
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > max && line) {
        out.push(line);
        line = word;
      } else line = test;
    }
    if (line) out.push(line);
    return out;
  };
  const inner = width - padding * 2;

  type Op = (y: number, draw: boolean) => number;
  const ops: Op[] = [];
  const text = (value: string, size: number, weight: number, color: string, align: "left" | "right" | "center" = "left", gap = 6): Op => (y, draw) => {
    const lines = wrap(value, size, weight, inner);
    for (const l of lines) {
      y += size + 4;
      if (draw) {
        ctx.font = `${weight} ${size}px ${font}`;
        ctx.fillStyle = color;
        ctx.textAlign = align;
        ctx.fillText(l, align === "left" ? padding : align === "right" ? width - padding : width / 2, y);
      }
    }
    return y + gap;
  };
  const row = (left: string, right: string, size: number, weight: number, color: string): Op => (y, draw) => {
    const rightWidth = (() => {
      ctx.font = `${weight} ${size}px ${font}`;
      return ctx.measureText(right).width;
    })();
    const lines = wrap(left, size, weight === 800 ? 700 : 400, inner - rightWidth - 12);
    lines.forEach((l, i) => {
      y += size + 4;
      if (draw) {
        ctx.font = `${weight === 800 ? 700 : 400} ${size}px ${font}`;
        ctx.fillStyle = weight === 800 ? COLORS.ink : COLORS.grey;
        ctx.textAlign = "left";
        ctx.fillText(l, padding, y);
        if (i === 0) {
          ctx.font = `${weight} ${size}px ${font}`;
          ctx.fillStyle = color;
          ctx.textAlign = "right";
          ctx.fillText(right, width - padding, y);
        }
      }
    });
    return y + 6;
  };
  const rule: Op = (y, draw) => {
    y += 8;
    if (draw) {
      ctx.strokeStyle = COLORS.border;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    return y + 8;
  };

  ops.push(text(view.title, 20, 800, COLORS.ink, "left", 2), text(view.dateLine, 13, 400, COLORS.grey, "left", 2), text(view.customerLine, 15, 700, COLORS.ink), rule);
  for (const line of view.lines) ops.push(row(line.left, line.right, 14, 600, COLORS.ink));
  if (view.note) ops.push(text(view.note, 13, 400, COLORS.grey));
  ops.push(rule, row(view.totalLabel, view.total, 18, 800, COLORS.ink), rule);
  for (const b of view.balances) ops.push(row(b.label, b.value, 15, 800, b.tone === "debt" ? COLORS.brick : b.tone === "advance" ? COLORS.positive : COLORS.ink));
  if (view.dueLine) ops.push(text(view.dueLine, 13, 600, COLORS.ink));
  ops.push(rule);
  for (const f of view.footerLines) ops.push(text(f, 11, 400, COLORS.grey, "center", 0));

  const headerHeight = 76;
  let height = headerHeight + 8;
  for (const op of ops) height = op(height, false);
  height += padding;

  canvas.width = width * scale;
  canvas.height = height * scale;
  ctx.scale(scale, scale);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = COLORS.green;
  ctx.fillRect(0, 0, width, headerHeight);
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "left";
  ctx.font = `800 20px ${font}`;
  ctx.fillText(view.shopName, padding, 32);
  ctx.font = `400 12px ${font}`;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  wrap(view.shopDetails, 12, 400, inner)
    .slice(0, 2)
    .forEach((l, i) => ctx.fillText(l, padding, 52 + i * 15));

  let y = headerHeight + 8;
  for (const op of ops) y = op(y, true);

  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Image impossible"))), "image/png"));
}

export interface StatementView {
  shopName: string;
  shopDetails: string;
  title: string;
  customerLines: string[];
  periodLine: string;
  summary: { label: string; value: string; strong?: boolean }[];
  columns: [string, string, string, string, string];
  rows: { date: string; detail: string[]; taken: string; paid: string; balance: string; cancelled: boolean }[];
  totals: { label: string; taken: string; paid: string; balance: string };
  cancelledNote: string;
  editedLine: string;
  pageLabel: (page: number, pages: number) => string;
}

/** Relevé de compte A4 (PDF), lisible aussi sur téléphone. jsPDF n'est chargé qu'à ce moment-là. */
export async function renderStatementPdf(view: StatementView): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const M = 14;
  const t = (s: string) => pdfText(s);
  const rgb = (hex: string) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)] as const;
  const color = (hex: string) => doc.setTextColor(...rgb(hex));

  // En-tête
  doc.setFillColor(...rgb(COLORS.green));
  doc.rect(0, 0, W, 26, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  color("#FFFFFF");
  doc.text(t(view.shopName), M, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(t(view.shopDetails), M, 19);

  let y = 36;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  color(COLORS.ink);
  doc.text(t(view.title), M, y);
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  for (const line of view.customerLines) {
    doc.text(t(line), M, y);
    y += 5;
  }
  color(COLORS.grey);
  doc.text(t(view.periodLine), M, y);
  y += 6;

  // Résumé
  doc.setFillColor(...rgb(COLORS.greenSoft));
  const boxHeight = 6 + view.summary.length * 6;
  doc.roundedRect(M, y, W - 2 * M, boxHeight, 2, 2, "F");
  let sy = y + 6;
  for (const item of view.summary) {
    doc.setFont("helvetica", item.strong ? "bold" : "normal");
    color(COLORS.ink);
    doc.text(t(item.label), M + 4, sy);
    doc.text(t(item.value), W - M - 4, sy, { align: "right" });
    sy += 6;
  }
  y += boxHeight + 8;

  // Tableau
  const cols = [M, M + 24, W - M - 66, W - M - 40, W - M];
  const header = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    color(COLORS.grey);
    doc.text(t(view.columns[0]), cols[0]!, y);
    doc.text(t(view.columns[1]), cols[1]!, y);
    doc.text(t(view.columns[2]), cols[2]! + 22, y, { align: "right" });
    doc.text(t(view.columns[3]), cols[3]! + 22, y, { align: "right" });
    doc.text(t(view.columns[4]), cols[4]!, y, { align: "right" });
    y += 2;
    doc.setDrawColor(...rgb(COLORS.border));
    doc.line(M, y, W - M, y);
    y += 5;
  };
  header();
  doc.setFontSize(9);
  for (const r of view.rows) {
    const detail = r.detail.flatMap((d) => doc.splitTextToSize(t(d), cols[2]! - cols[1]! - 2) as string[]);
    // Date et heure sur deux lignes si besoin : la colonne reste étroite sans déborder sur le détail.
    const dateLines = doc.splitTextToSize(t(r.date), cols[1]! - cols[0]! - 3) as string[];
    const h = Math.max(1, detail.length, dateLines.length) * 4.2 + 2;
    if (y + h > 280) {
      doc.addPage();
      y = 18;
      header();
    }
    doc.setFont("helvetica", "normal");
    color(r.cancelled ? COLORS.grey : COLORS.ink);
    dateLines.forEach((d, i) => doc.text(d, cols[0]!, y + i * 4.2));
    detail.forEach((d, i) => doc.text(d, cols[1]!, y + i * 4.2));
    doc.text(t(r.taken), cols[2]! + 22, y, { align: "right" });
    doc.text(t(r.paid), cols[3]! + 22, y, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.text(t(r.balance), cols[4]!, y, { align: "right" });
    if (r.cancelled) {
      // Annulation : la ligne reste visible, barrée.
      doc.setDrawColor(...rgb(COLORS.grey));
      doc.line(cols[0]!, y - 1.2, cols[4]!, y - 1.2);
    }
    y += h;
  }
  doc.setDrawColor(...rgb(COLORS.border));
  doc.line(M, y - 2, W - M, y - 2);
  y += 3;
  doc.setFont("helvetica", "bold");
  color(COLORS.ink);
  doc.text(t(view.totals.label), cols[1]!, y);
  doc.text(t(view.totals.taken), cols[2]! + 22, y, { align: "right" });
  doc.text(t(view.totals.paid), cols[3]! + 22, y, { align: "right" });
  doc.text(t(view.totals.balance), cols[4]!, y, { align: "right" });
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  color(COLORS.grey);
  doc.text(t(view.cancelledNote), M, Math.min(y, 285));

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    color(COLORS.grey);
    doc.text(t(view.editedLine), M, 292);
    doc.text(t(view.pageLabel(p, pages)), W - M, 292, { align: "right" });
  }
  return doc.output("blob");
}

/**
 * Envoi : partage direct du fichier (WhatsApp…) quand le téléphone le permet, sinon téléchargement
 * puis envoi manuel dans WhatsApp (RG9). Renvoie le mode utilisé.
 */
export async function shareOrDownload(blob: Blob, fileName: string, title: string): Promise<"shared" | "downloaded" | "cancelled"> {
  const file = new File([blob], fileName, { type: blob.type });
  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return "shared";
    } catch (error) {
      if ((error as Error).name === "AbortError") return "cancelled";
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}
