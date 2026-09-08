// Converts a zero-based column number into Google Sheets A1 alphabetical notation (0 -> A, 26 -> AA)
export function indexToA1Column(colIndex: number): string {
  let temp = colIndex;
  let letter = '';
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

// Converts an A1 column letter back to its zero-based numerical index (A -> 0, AA -> 26)
export function a1ColumnToIndex(column: string): number {
  let result = 0;
  for (let i = 0; i < column.length; i++) {
    result = result * 26 + (column.charCodeAt(i) - 64);
  }
  return result - 1;
}
