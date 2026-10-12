import { createContext, useContext } from 'react';
import type { BasicAccessUser } from './basicAccess';
export const AccessContext = createContext<BasicAccessUser | null>(null);
export const useAccess = () => useContext(AccessContext);
