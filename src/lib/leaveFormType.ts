// Match URL/API annual aliases to the value used by the form's select.
export function leaveFormType(value: string): string {
  if (value === 'annual') return 'vacation';
  return ['sick', 'vacation', 'personal', 'university'].includes(value) ? value : '';
}
