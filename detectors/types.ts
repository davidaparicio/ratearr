import type { TitleQuery } from '../utils/types';

export interface SiteDetector {
  hosts: string[];
  matches(url: URL): boolean;
  extract(doc: Document, url: URL): TitleQuery | null;
}
