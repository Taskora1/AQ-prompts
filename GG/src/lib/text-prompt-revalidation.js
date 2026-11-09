import { revalidatePath } from 'next/cache';

export const TEXT_PROMPT_LIBRARY_PATH = '/text-prompts';

export function revalidateTextPromptLibrary() {
  revalidatePath(TEXT_PROMPT_LIBRARY_PATH);
}
