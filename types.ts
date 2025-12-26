
export interface Language {
  name: string;
  flag: string;
}

export interface TranscriptEntry {
  id: number;
  speaker: 'user' | 'alex';
  text: string;
}
