"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function TransactionDescription({ description, details, compactOnMobile = false }: { description: string; details?: string | null; compactOnMobile?: boolean }) {
  const detail = details?.trim();
  const descriptionCharacters = Array.from(description);
  const descriptionIsLong = descriptionCharacters.length > 30;
  const mobileDescription = descriptionIsLong
    ? `${descriptionCharacters.slice(0, 30).join("")}…`
    : description;
  const showMobileDetails = Boolean(detail || (compactOnMobile && descriptionIsLong));

  return <span className={`transaction-description${compactOnMobile ? " compact-on-mobile" : ""}`}>
    <b title={detail || undefined}>
      <span className="desktop-transaction-description-text">{description}</span>
      <span className="mobile-transaction-description-text">{mobileDescription}</span>
    </b>
    {showMobileDetails && <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="transaction-detail-trigger" aria-label={`Mostra il dettaglio di ${description}`}>ⓘ</button>
      </PopoverTrigger>
      <PopoverContent className="transaction-detail-popover" side="top" align="start">
        <div><strong>Descrizione</strong><p>{description}</p></div>
        {detail && <div><strong>Dettaglio</strong><p>{detail}</p></div>}
      </PopoverContent>
    </Popover>}
  </span>;
}
