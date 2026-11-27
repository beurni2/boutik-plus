import { describe, expect, it } from 'vitest';
import { phraseCourse, quandOuaga, titreSos } from '../src/sos/view';
import { SOS_PAR, SOS_RELECTURE_MS } from '../src/sos/service';

/**
 * The SOS strip's words, decided purely. Ouagadougou keeps UTC all year (no
 * summer time), so « heure de Ouagadougou » is the UTC clock: the founder may
 * read the console from another time zone, and the strip must say the rider's
 * hour, not his.
 */

describe('quandOuaga — when Séra received it, on the Ouagadougou clock', () => {
  it('today: the hour and minutes only', () => {
    expect(quandOuaga('2026-11-27T14:05:09.000Z', new Date('2026-11-27T14:06:00.000Z'))).toBe("aujourd'hui à 14 h 05");
    expect(quandOuaga('2026-11-27T09:00:00.000Z', new Date('2026-11-27T23:59:00.000Z'))).toBe("aujourd'hui à 9 h 00");
  });

  it('another day on the Ouagadougou clock names the day, even an hour ago', () => {
    expect(quandOuaga('2026-11-26T23:50:00.000Z', new Date('2026-11-27T00:10:00.000Z'))).toBe('le 26/11 à 23 h 50');
    expect(quandOuaga('2026-01-03T07:04:00.000Z', new Date('2026-11-27T10:00:00.000Z'))).toBe('le 03/01 à 7 h 04');
  });

  it('a time the reader cannot read is not dressed up as one', () => {
    expect(quandOuaga('pas une date', new Date('2026-11-27T10:00:00.000Z'))).toBe('');
  });
});

describe('titreSos — who, by the name he typed, and the phone he typed when there is one', () => {
  it('the name and the phone, beside each other', () => {
    expect(titreSos({ riderId: 'r-1', nom: 'Awa Sos', telephone: '70 11 22 33' })).toBe('SOS de Awa Sos · 70 11 22 33');
  });
  it('no phone on the roster: no phone written, never one invented', () => {
    expect(titreSos({ riderId: 'r-1', nom: 'Awa Sos', telephone: null })).toBe('SOS de Awa Sos');
    expect(titreSos({ riderId: 'r-1', nom: 'Awa Sos', telephone: '  ' })).toBe('SOS de Awa Sos');
  });
  it('the roster unread: the rider id Séra gave, never a guessed name', () => {
    expect(titreSos({ riderId: 'rider-77', nom: null, telephone: null })).toBe('SOS de rider-77');
  });
});

describe('phraseCourse — on a course or not, as the phone reported it', () => {
  it('says each', () => {
    expect(phraseCourse(true)).toBe("En course au moment de l'alerte.");
    expect(phraseCourse(false)).toBe("Pas en course au moment de l'alerte.");
  });
});

describe('the two fixed values of the desk', () => {
  it('re-read every 15 s (ruled against the flagged 60 s answer target), answered as « founder »', () => {
    // The walks move the strip's clock by this much; a change here is a change
    // the coordinator rules and the founder is told.
    expect(SOS_RELECTURE_MS).toBe(15_000);
    expect(SOS_PAR).toBe('founder');
  });
});
