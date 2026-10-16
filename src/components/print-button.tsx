"use client";
import { Button , EmojiIcon, IconText} from "@/components/ui";
export function PrintButton() {
  return <Button onClick={() => window.print()}><IconText>{<EmojiIcon emoji="" />}</IconText> چاپ روکش سند</Button>;
}
