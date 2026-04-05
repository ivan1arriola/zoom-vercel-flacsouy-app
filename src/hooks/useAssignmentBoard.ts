import { useState } from "react";
import type {
  AssignmentBoardEvent,
  AssignableAssistant,
  AssignmentSuggestion
} from "@/src/services/dashboardApi";

export function useAssignmentBoard() {
  const [assignmentBoardEvents, setAssignmentBoardEvents] = useState<AssignmentBoardEvent[]>([]);
  const [assignableAssistants, setAssignableAssistants] = useState<AssignableAssistant[]>([]);
  const [isLoadingAssignmentBoard, setIsLoadingAssignmentBoard] = useState(false);
  const [assigningEventId, setAssigningEventId] = useState<string | null>(null);
  const [selectedAssistantByEvent, setSelectedAssistantByEvent] = useState<Record<string, string>>({});
  const [assignmentSuggestion, setAssignmentSuggestion] = useState<AssignmentSuggestion | null>(null);
  const [suggestionSessionId, setSuggestionSessionId] = useState<string | null>(null);
  const [isLoadingSuggestion, setIsLoadingSuggestion] = useState(false);

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
    setSelectedAssistantByEvent,
    assignmentSuggestion,
    setAssignmentSuggestion,
    suggestionSessionId,
    setSuggestionSessionId,
    isLoadingSuggestion,
    setIsLoadingSuggestion
  };
}
