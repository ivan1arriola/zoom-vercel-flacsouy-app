import { useState } from "react";
import type { CurrentUser } from "@/src/services/userApi";

export function useUserProfile() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [googleLinked, setGoogleLinked] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);
  const [isLoadingGoogleStatus, setIsLoadingGoogleStatus] = useState(false);
  const [isSyncingGoogleProfile, setIsSyncingGoogleProfile] = useState(false);
  const [isUnlinkingGoogleAccount, setIsUnlinkingGoogleAccount] = useState(false);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    firstName: "",
    lastName: "",
    image: ""
  });
  const [showProfileForm, setShowProfileForm] = useState(false);

  return {
    user,
    setUser,
    googleLinked,
    setGoogleLinked,
    hasPassword,
    setHasPassword,
    isLoadingGoogleStatus,
    setIsLoadingGoogleStatus,
    isSyncingGoogleProfile,
    setIsSyncingGoogleProfile,
    isUnlinkingGoogleAccount,
    setIsUnlinkingGoogleAccount,
    isUpdatingProfile,
    setIsUpdatingProfile,
    profileForm,
    setProfileForm,
    showProfileForm,
    setShowProfileForm
  };
}
