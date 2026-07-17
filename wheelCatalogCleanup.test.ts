import { mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  buildCleanupReport,
  quarantineFromReport,
  scanWheelCatalog
} from './scripts/wheel-catalog-cleanup-lib.mjs';

const makeRoot = async () => mkdtemp(join(tmpdir(), 'wheel-catalog-cleanup-'));

const writeImage = async (root: string, relativePath: string, content: string) => {
  const fullPath = join(root, ...relativePath.split('/'));
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content);
  return fullPath;
};

const audit = async (root: string) => {
  const files = await scanWheelCatalog(root);
  return buildCleanupReport(files, {
    rootDir: root,
    generatedAt: '2026-07-06T00:00:00.000Z'
  });
};

describe('wheel catalog cleanup audit', () => {
  it('keeps one exact duplicate and marks the rest removable', async () => {
    const root = await makeRoot();
    await writeImage(root, '17 5x100/base-a.jpg', 'same-image');
    await writeImage(root, '17 5x100/base-b.jpg', 'same-image');

    const report = await audit(root);
    const actions = report.entries.map((entry) => entry.action).sort();

    expect(actions).toEqual(['keep', 'remove_exact_duplicate']);
    expect(report.summary.removeExactDuplicate).toBe(1);
  });

  it('keeps the newest dated UPDATED copy for exact duplicates', async () => {
    const root = await makeRoot();
    await writeImage(root, '17 5x100/UPDATED 4.3/wheel.jpg', 'same-image');
    await writeImage(root, '17 5x100/UPDATED 16.4/wheel.jpg', 'same-image');
    await writeImage(root, '17 5x100/wheel.jpg', 'same-image');

    const report = await audit(root);
    const kept = report.entries.find((entry) => entry.action === 'keep');
    const removed = report.entries.filter((entry) => entry.action === 'remove_older_updated_copy');

    expect(kept?.relativePath).toBe('17 5x100\\UPDATED 16.4\\wheel.jpg');
    expect(removed).toHaveLength(2);
    expect(report.summary.removeOlderUpdatedCopy).toBe(2);
  });

  it('uses nested UPDATED folders when choosing the latest duplicate', async () => {
    const root = await makeRoot();
    await writeImage(root, '17 5x114/UPDATED 25.4/wheel.jpg', 'same-image');
    await writeImage(root, '17 5x114/UPDATED 25.4/UPDATED 26.5/wheel.jpg', 'same-image');

    const report = await audit(root);
    const kept = report.entries.find((entry) => entry.action === 'keep');

    expect(kept?.relativePath).toBe('17 5x114\\UPDATED 25.4\\UPDATED 26.5\\wheel.jpg');
    expect(report.summary.removeOlderUpdatedCopy).toBe(1);
  });

  it('marks same bucket and similar filename with different bytes for manual review', async () => {
    const root = await makeRoot();
    await writeImage(root, '18 5x112/UPDATED 12.6/Wheel A.jpg', 'first-image');
    await writeImage(root, '18 5x112/UPDATED 30.6/Wheel A.jpg', 'changed-image');

    const report = await audit(root);

    expect(report.entries.every((entry) => entry.action === 'review_manually')).toBe(true);
    expect(report.summary.reviewManually).toBe(2);
  });

  it('moves only auto-removable files into quarantine', async () => {
    const root = await makeRoot();
    const quarantine = await makeRoot();
    await writeImage(root, '16 4x100/keep.jpg', 'unique-image');
    await writeImage(root, '16 4x100/duplicate.jpg', 'unique-image');
    const reviewPath = await writeImage(root, '16 4x100/review.jpg', 'changed-image');
    const updatedReviewPath = await writeImage(root, '16 4x100/UPDATED 1.7/review.jpg', 'another-image');

    const report = await audit(root);
    const movedEntry = report.entries.find((entry) => (
      entry.action === 'remove_exact_duplicate' || entry.action === 'remove_older_updated_copy'
    ));
    const result = await quarantineFromReport(report, quarantine);

    expect(result.moved).toBe(1);
    expect(movedEntry).toBeTruthy();
    await expect(stat(movedEntry!.sourcePath)).rejects.toThrow();
    await expect(stat(reviewPath)).resolves.toBeTruthy();
    await expect(stat(updatedReviewPath)).resolves.toBeTruthy();
    await expect(readFile(join(quarantine, movedEntry!.relativePath), 'utf8')).resolves.toBe('unique-image');
  });
});
