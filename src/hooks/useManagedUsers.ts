import { useState } from "react";
import type { ManagedUser } from "@/src/services/userApi";

export function useManagedUsers() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [resendingActivationUserId, setResendingActivationUserId] = useState<string | null>(null);
  const [createUserForm, setCreateUserForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    role: "DOCENTE"
  });

  return {
    users,
    setUsers,
    isLoadingUsers,
    setIsLoadingUsers,
    isCreatingUser,
    setIsCreatingUser,
    updatingUserId,
    setUpdatingUserId,
    resendingActivationUserId,
    setResendingActivationUserId,
    createUserForm,
    setCreateUserForm
  };
}
