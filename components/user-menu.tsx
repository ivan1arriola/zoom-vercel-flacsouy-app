"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";
import { UserAvatar } from "./user-avatar";

const SUPPORT_VIEW_ROLE = "SOPORTE_ZOOM";

const viewOptions = [
  { value: "ADMINISTRADOR", label: "Administrador" },
  { value: "DOCENTE", label: "Docente" },
  { value: SUPPORT_VIEW_ROLE, label: "Asistente / Soporte Zoom" },
  { value: "CONTADURIA", label: "Contaduria" }
] as const;

function normalizeViewRole(raw: string): string {
  if (raw === "ASISTENTE_ZOOM" || raw === SUPPORT_VIEW_ROLE) {
    return SUPPORT_VIEW_ROLE;
  }
  return raw;
}

function formatRoleLabel(role: string): string {
  const normalized = normalizeViewRole(role.toUpperCase());
  const found = viewOptions.find((option) => option.value === normalized);
  return found?.label ?? role;
}

interface UserMenuProps {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  image?: string | null;
  role: string;
}

export function UserMenu({ firstName, lastName, email, image, role }: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingView, setPendingView] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isAdmin = role === "ADMINISTRADOR";
  const menuId = "user-menu-popover";

  const displayName = useMemo(() => {
    const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
    if (fullName) {
      return fullName;
    }

    if (email) {
      const localPart = email.split("@")[0]?.trim();
      return localPart || email;
    }

    return "Usuario";
  }, [email, firstName, lastName]);
  const rawView = normalizeViewRole((searchParams.get("viewAs") ?? "ADMINISTRADOR").toUpperCase());
  const currentView = viewOptions.some((option) => option.value === rawView) ? rawView : "ADMINISTRADOR";
  const currentViewLabel = viewOptions.find((option) => option.value === currentView)?.label ?? "Administrador";
  const secondaryLabel = useMemo(() => {
    return isAdmin ? `Modo: ${currentViewLabel}` : formatRoleLabel(role);
  }, [isAdmin, currentViewLabel, role]);

  const isChangingView = pendingView !== null && pendingView !== currentView;

  useEffect(() => {
    if (!isOpen) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [isOpen]);

  useEffect(() => {
    if (pendingView && pendingView === currentView) {
      setPendingView(null);
    }
  }, [pendingView, currentView]);

  function onViewChange(nextValue: string) {
    if (!isAdmin) {
      return;
    }
    if (nextValue === currentView) {
      setPendingView(null);
      return;
    }

    setPendingView(nextValue);
    const params = new URLSearchParams(searchParams.toString());
    if (nextValue === "ADMINISTRADOR") {
      params.delete("viewAs");
    } else {
      params.set("viewAs", nextValue);
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <div className="user-menu">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`user-menu-trigger ${isOpen ? "is-open" : ""}`}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-controls={isOpen ? menuId : undefined}
        aria-label={isOpen ? "Cerrar menu de usuario" : "Abrir menu de usuario"}
      >
        <div className="user-menu-trigger-main">
          <UserAvatar firstName={firstName} lastName={lastName} image={image} size={38} />
          <div className="user-menu-ident">
            <p className="user-menu-name">{displayName}</p>
            <p className="user-menu-role">{secondaryLabel}</p>
          </div>
        </div>
        <span className="g-icon user-menu-chevron" aria-hidden="true">
          {isOpen ? "expand_less" : "expand_more"}
        </span>
      </button>

      {isOpen && (
        <>
          <div id={menuId} className="user-menu-popover" role="menu" aria-label="Menu de usuario">
            <div className="user-menu-popover-header">
              <UserAvatar firstName={firstName} lastName={lastName} image={image} size={40} />
              <div className="user-menu-popover-ident">
                <p className="user-menu-popover-name">{displayName}</p>
                <p className="user-menu-popover-email">{email || "-"}</p>
              </div>
            </div>

            {isAdmin ? (
              <div className="user-menu-section">
                <p className="user-menu-section-title">Modo de vista</p>
                <div className="user-menu-view-list" aria-busy={isChangingView}>
                  {viewOptions.map((option) => {
                    const isSelected = option.value === currentView;
                    const isPendingOption = option.value === pendingView && isChangingView;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={`user-menu-view-option ${isSelected ? "is-selected" : ""} ${
                          isPendingOption ? "is-pending" : ""
                        }`}
                        role="menuitemradio"
                        aria-checked={isSelected}
                        disabled={isChangingView}
                        onClick={() => onViewChange(option.value)}
                      >
                        <span className="user-menu-view-option-text">{option.label}</span>
                        <span className="g-icon user-menu-view-option-icon" aria-hidden="true">
                          {isPendingOption
                            ? "autorenew"
                            : isSelected
                              ? "check_circle"
                              : "radio_button_unchecked"}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {isChangingView ? (
                  <p className="user-menu-view-status">
                    <span className="g-icon user-menu-spinner" aria-hidden="true">
                      autorenew
                    </span>
                    Actualizando vista...
                  </p>
                ) : null}
              </div>
            ) : null}

            <Link href="/?tab=perfil" onClick={() => setIsOpen(false)} className="user-menu-item" role="menuitem">
              <span className="g-icon user-menu-item-icon" aria-hidden="true">
                person
              </span>
              <span>Editar perfil</span>
            </Link>

            <button
              type="button"
              onClick={async () => {
                setIsOpen(false);
                await signOut({ redirectTo: "/" });
              }}
              className="user-menu-item user-menu-item-danger"
              role="menuitem"
            >
              <span className="g-icon user-menu-item-icon" aria-hidden="true">
                logout
              </span>
              <span>Cerrar sesion</span>
            </button>
          </div>

          <div className="user-menu-backdrop" onClick={() => setIsOpen(false)} aria-hidden="true" />
        </>
      )}
    </div>
  );
}
