import { buildPng } from './media-containers';

export const SAMPLE_SUBTITLES = `1
00:00:00,500 --> 00:00:03,000
Welcome to the campus tour, filmed near Riverside Hall.

2
00:00:03,500 --> 00:00:06,000
Questions? Email jane.doe@example.com any time.

3
00:00:06,500 --> 00:00:09,000
Our lab booking number is 4111 1111 1111 1111.

4
00:00:09,500 --> 00:00:12,000
Call +1 415 555 0132 after 5 PM.
`;

export const SAMPLE_TRANSCRIPT = JSON.stringify(
  {
    segments: [
      { start: 0, end: 4, text: "I'm standing outside 48 Harbor Street today." },
      { start: 4, end: 8, text: 'My dev token is sk_live_EXAMPLE1234567890 for the demo.' },
    ],
  },
  null,
  2,
);

export function buildSampleThumbnail(): Uint8Array {
  return buildPng([
    { keyword: 'Author', value: 'jane.doe@example.com' },
    { keyword: 'GPS', value: '28.61390, 77.20900' },
  ]);
}
