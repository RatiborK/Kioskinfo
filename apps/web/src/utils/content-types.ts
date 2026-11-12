// apps/web/src/utils/content-types.ts — visitor-facing public data contracts.
export type EventType='concert'|'play'|'festival'|'other';
export type EventVenue='hall'|'foyer'|'orfey';
export type PublicEvent={id:string;title:string;date:string;time:string;type:EventType;venue:EventVenue;description:string};
export type DocumentCategory='prices'|'policies'|'benefits'|'other';
export type PublicDocument={id:string;title:string;category:DocumentCategory;format:'pdf'|'docx';sizeBytes:number;createdAt:string};
