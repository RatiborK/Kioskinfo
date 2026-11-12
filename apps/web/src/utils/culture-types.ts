// apps/web/src/utils/culture-types.ts — shared published cultural catalog in the kiosk and editor.
export type CultureCategory={id:string;title:string;symbol:string;description:string};
export type CultureLeader={id:string;name:string;photo:string;bio:string;source:string};
export type CultureCollective={id:string;name:string;category:string;leaderIds:string[];room:string;schedule:string;age:string;
  programs:string[];description:string;history:string;photo:string;videoUrl:string;source:string;sourcePage:number};
export type SafetySection={id:string;title:string;subtitle:string;icon:string;paragraphs:string[]};
export type CultureContent={
  about:{title:string;intro:string;facts:string[];history:string[];videoUrl:string;photo:string;photoCredit:string;sourceUrl:string};
  safety:{title:string;intro:string;sections:SafetySection[];notice:string};
  tickets:{title:string;intro:string;url:string;note:string};
  contact:{address:string;phone:string;clubsPhone:string;eventsPhone:string;email:string;hours:string;website:string};
  categories:CultureCategory[];leaders:CultureLeader[];collectives:CultureCollective[];
};
export type CultureState={revision:number;publishedRevision:number;draft:CultureContent;published:CultureContent;updatedAt:string};
