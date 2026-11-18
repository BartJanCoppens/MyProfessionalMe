// The JSON object in a model's reply (it may have words around it), or null when there is none or it is broken.
// The one reader every AI answer goes through before its own shape is checked (the code is shared with the `ai` function).
export { jsonObject } from '../../supabase/functions/_shared/promptData.ts';
