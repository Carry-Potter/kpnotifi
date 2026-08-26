/** Jedan oglas kako ga mi vidimo (podskup KP polja koji nam treba). */
export interface KpAd {
  id: number;
  name: string;
  /** Cena kao broj, 0 ako je "Kontakt" / dogovor. */
  priceNumber: number;
  /** "eur" | "rsd" | "" */
  currency: string;
  /** Tekst cene za prikaz, npr. "395 €" ili "Kontakt". */
  priceText: string;
  location: string;
  condition: string;
  conditionId: string;
  /** "sell" | "buy" */
  type: string;
  categoryId: number;
  categoryName: string;
  groupId: number;
  groupName: string;
  /** Puni URL glavne fotografije, prazan string ako nema. */
  image: string;
  /** Relativan URL oglasa, npr. "/mobilni-telefoni/.../oglas/98750184" */
  adUrl: string;
  /** "2026-08-16 08:38:04" (lokalno KP vreme) */
  postedRaw: string;
  descriptionSnippet: string;
}

/** Rezultat jedne stranice pretrage. */
export interface KpSearchResult {
  ads: KpAd[];
  total: number;
  pages: number;
  page: number;
  /** KP-ov opis primenjenih filtera, npr. "Automobili | Cena: 2000€ - 6000€". */
  filterName: string;
}

export interface KpCategory {
  id: number;
  name: string;
  kind: string;
}

export interface KpGroup {
  id: number;
  name: string;
  parentId: number;
}

export interface KpLocation {
  id: number;
  name: string;
  big: boolean;
}

/** Definicija jednog filter-atributa specifičnog za kategoriju (npr. carModel). */
export interface KpAttributeDef {
  attributeId: number;
  code: string;
  displayName: string;
  isMultiSelect: boolean;
  dataType: string;
  uiControl: string;
  sortOrder: number;
}

/** Kompletan katalog izvučen sa KP stranice. */
export interface KpCatalog {
  categories: KpCategory[];
  groups: KpGroup[];
  locations: KpLocation[];
  /** categoryId -> definicije atributa */
  attributes: Record<string, KpAttributeDef[]>;
}
