/**
 * `SheetFieldContext` — marks a field as rendering inside `<GlassSheet />`.
 *
 * Inside a sheet, `<GlassInput />` swaps its plain `TextInput` for gorhom's
 * `BottomSheetTextInput`, which registers the focused input with the sheet's
 * keyboard state. Without that registration the sheet never learns the
 * keyboard is up and stays put, leaving the fields covered (phone flaw: the
 * keyboard hid the note field on the add-expense sheet).
 */
import { createContext } from 'react';

export const SheetFieldContext = createContext(false);
