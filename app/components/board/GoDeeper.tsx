import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type Send = (opts: {
  message: string;
  context?: string;
  contextLabel?: string;
  submit?: boolean;
  openSidebar?: boolean;
}) => string;

/** Hands what the person typed, and what they have selected, to the agent chat. */
export function GoDeeper({
  caseId,
  selectedIds,
  send = sendToAgentChat as Send,
}: {
  caseId: string;
  selectedIds: string[];
  send?: Send;
}) {
  const [text, setText] = useState("");
  const nothingSelected = selectedIds.length === 0;
  const blank = text.trim() === "";

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (nothingSelected || blank) return;
        send({
          message: text.trim(),
          context: `Case ${caseId}. Selected item ids: ${selectedIds.join(", ")}.`,
          contextLabel: "Selected on the board",
          submit: true,
          openSidebar: true,
        });
        setText("");
      }}
    >
      <Label htmlFor="rs-go-deeper">Ask the agent to go further on this</Label>
      <textarea
        id="rs-go-deeper"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        placeholder="e.g. Who else is registered at this address?"
      />
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={nothingSelected || blank}>
          Send to agent
        </Button>
        {nothingSelected ? <span className="text-xs text-muted-foreground">Select a card first.</span> : null}
      </div>
    </form>
  );
}
