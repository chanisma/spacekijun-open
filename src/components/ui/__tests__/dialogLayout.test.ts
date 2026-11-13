import assert from 'node:assert/strict';
import { test } from 'node:test';
import { splitDialogClasses } from '../dialog-layout';

test('editor dimensions stay on the surface while scrolling and layout move inside', () => {
  const classes = splitDialogClasses('max-w-4xl h-[600px] max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden');
  assert.equal(classes.surface, 'max-w-4xl h-[600px] max-h-[90vh]');
  assert.equal(classes.viewport, 'flex flex-col gap-0 p-0 overflow-hidden');
  assert.equal(classes.customPadding, true);
});

test('responsive layout and close-button selectors retain their target', () => {
  const classes = splitDialogClasses('sm:p-8 md:grid-cols-2 sm:max-w-lg [&>button]:hidden');
  assert.equal(classes.viewport, 'sm:p-8 md:grid-cols-2');
  assert.equal(classes.surface, 'sm:max-w-lg [&>button]:hidden');
  assert.equal(classes.customPadding, true);
  assert.equal(splitDialogClasses('max-w-sm').customPadding, false);
});
