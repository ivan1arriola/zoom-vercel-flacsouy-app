import { useState } from "react";
import type { AssignmentBoardEvent, AssignableAssistant } from "@/src/services/dashboardApi";

export function useAssignmentBoard() {
  const [assignmentBoardEvents, setAssignmentBoardEvents] = useState<AssignmentBoardEvent[]>([]);
  const [assignableAssistants, setAssignableAssistants] = useState<AssignableAssistant[]>([]);
  const [isLoadingAssignmentBoard, setIsLoadingAssignmentBoard] = useState(false);
  const [assigningEventId, setAssigningEventId] = useState<string | null>(null);
  const [selectedAssistantByEvent, setSelectedAssistantByEvent] = useState<Record<string, string>>({});

  return {
    assignmentBoardEvents,
    setAssignmentBoardEvents,
    assignableAssistants,
    setAssignableAssistants,
    isLoadingAssignmentBoard,
    setIsLoadingAssignmentBoard,
    assigningEventId,
    setAssigningEventId,
    selectedAssistantByEvent,
    setSelectedAssistantByEvent
  };
}
