import { createContext, useContext } from 'react';
import { sellerDescription, sellerLabel } from './sellerLabels';
const empty = new Map<string, string>();
export const SellerCatalogContext = createContext({
  label: (code: string | null | undefined, fallback = '') => sellerLabel(empty, code, fallback),
  description: (code: string | null | undefined, fallback = '') => sellerDescription(empty, code, fallback),
});
export const useSellerCatalog = () => useContext(SellerCatalogContext);
