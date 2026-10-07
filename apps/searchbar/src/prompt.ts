/** A question or countdown from a script, shown in the search bar window. */
export interface Prompt {
  id: number;
  kind: 'ask' | 'countdown';
  text: string;
  action: string | null;
  seconds: number;
}
