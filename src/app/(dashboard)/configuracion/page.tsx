"use client"

import { useState, useEffect, useCallback } from "react"
import {
  User, Users, Save, Loader2, Plus, Eye, EyeOff,
  ShieldCheck, Shield, Package, CheckCircle2, XCircle,
  KeyRound, UserCog, LayoutGrid, AlertTriangle, Trash2, Copy, Check,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { createClient } from "@/lib/supabase"
import { useAuth } from "@/contexts/auth-context"
import { ROLE_LABELS } from "@/types/auth"
import { cn } from "@/lib/utils"
import type { UserRole } from "@/types/auth"

type Tab = "perfil" | "usuarios"

interface ProfileRow {
  id:         string
  nombre:     string
  email:      string
  role:       UserRole
  activo:     boolean
  permisos:   string[] | null
  created_at: string
}

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "super_admin",    label: "Super Admin"  },
  { value: "operador",       label: "Operador"     },
  { value: "operador_carga", label: "Op. de Carga" },
]

const ROLE_ICON: Record<UserRole, React.ReactNode> = {
  super_admin:    <ShieldCheck className="h-3 w-3" />,
  operador:       <Shield className="h-3 w-3" />,
  operador_carga: <Package className="h-3 w-3" />,
}

const MODULE_OPTIONS = [
  { href: "/dashboard",        label: "Inicio",      group: "Módulos principales"     },
  { href: "/inventario",       label: "Inventario",  group: "Módulos principales"     },
  { href: "/movimientos",      label: "Movimientos", group: "Módulos principales"     },
  { href: "/clientes",         label: "Clientes",    group: "Módulos principales"     },
  { href: "/reportes",         label: "Analítica",   group: "Módulos principales"     },
  { href: "/hes",              label: "HES",         group: "Módulos principales"     },
  { href: "/reports",          label: "Reports",     group: "Servicio almacenamiento" },
  { href: "/reports/despacho", label: "Despacho",    group: "Servicio almacenamiento" },
  { href: "/auditoria",        label: "Auditoría",   group: "Administración"          },
]

const ROLE_MODULE_DEFAULTS: Record<UserRole, string[]> = {
  super_admin:    ["/dashboard", "/inventario", "/movimientos", "/clientes", "/reportes", "/hes", "/reports", "/reports/despacho", "/auditoria"],
  operador:       ["/dashboard", "/inventario", "/movimientos", "/clientes", "/reportes", "/hes", "/reports", "/reports/despacho"],
  operador_carga: ["/inventario", "/reports", "/reports/despacho"],
}

const MODULE_GROUPS = [...new Set(MODULE_OPTIONS.map(m => m.group))]

function ModuleCheckboxes({
  selected,
  onChange,
}: {
  selected: string[]
  onChange: (v: string[]) => void
}) {
  return (
    <div className="space-y-3">
      {MODULE_GROUPS.map(group => (
        <div key={group}>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5">{group}</p>
          <div className="grid grid-cols-2 gap-0.5">
            {MODULE_OPTIONS.filter(m => m.group === group).map(m => (
              <label
                key={m.href}
                className="flex items-center gap-2 text-xs cursor-pointer px-2 py-1.5 rounded hover:bg-muted/60 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(m.href)}
                  onChange={e => {
                    if (e.target.checked) onChange([...selected, m.href])
                    else onChange(selected.filter(x => x !== m.href))
                  }}
                  className="h-3.5 w-3.5 rounded border-input accent-[oklch(0.35_0.12_240)]"
                />
                {m.label}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</Label>
      {children}
    </div>
  )
}

function StatusMsg({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null
  return (
    <div className={cn(
      "flex items-center gap-2 text-xs px-3 py-2 rounded-lg border",
      msg.ok
        ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-400"
        : "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400"
    )}>
      {msg.ok ? <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" /> : <XCircle className="h-3.5 w-3.5 flex-shrink-0" />}
      {msg.text}
    </div>
  )
}

function CopyablePassword({ password }: { password: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(password).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 dark:bg-amber-900/20 dark:border-amber-700">
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide mb-0.5">Contraseña temporal generada</p>
        <p className="font-mono text-sm font-bold text-amber-900 dark:text-amber-300 tracking-widest">{password}</p>
      </div>
      <button
        type="button"
        onClick={copy}
        className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-200 transition-colors"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? "Copiado" : "Copiar"}
      </button>
    </div>
  )
}

const initials = (nombre: string) =>
  nombre.split(" ").filter(Boolean).map(w => w[0]).slice(0, 2).join("").toUpperCase()

export default function ConfiguracionPage() {
  const { user, profile, role } = useAuth()
  const isSuperAdmin = role === "super_admin"

  const [tab, setTab] = useState<Tab>("perfil")

  /* ── Perfil ── */
  const [nombre,       setNombre]       = useState("")
  const [savingPerfil, setSavingPerfil] = useState(false)
  const [perfilMsg,    setPerfilMsg]    = useState<{ ok: boolean; text: string } | null>(null)

  const [newPass,     setNewPass]     = useState("")
  const [confirmPass, setConfirmPass] = useState("")
  const [showPass,    setShowPass]    = useState(false)
  const [savingPass,  setSavingPass]  = useState(false)
  const [passMsg,     setPassMsg]     = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => { if (profile?.nombre) setNombre(profile.nombre) }, [profile])
  useEffect(() => { if (profile?.must_change_password) setTab("perfil") }, [profile?.must_change_password])

  async function handleSavePerfil() {
    if (!user) return
    setSavingPerfil(true); setPerfilMsg(null)
    const supabase = createClient()
    const { error } = await supabase.from("profiles").update({ nombre }).eq("id", user.id)
    setSavingPerfil(false)
    setPerfilMsg(error ? { ok: false, text: error.message } : { ok: true, text: "Perfil actualizado correctamente" })
  }

  async function handleChangePassword() {
    if (newPass !== confirmPass) { setPassMsg({ ok: false, text: "Las contraseñas no coinciden" }); return }
    if (newPass.length < 8)      { setPassMsg({ ok: false, text: "Mínimo 8 caracteres" });          return }
    setSavingPass(true); setPassMsg(null)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: newPass })
    if (error) {
      setSavingPass(false)
      setPassMsg({ ok: false, text: error.message })
      return
    }
    const flagRes  = await fetch("/api/auth/clear-password-flag", { method: "POST" })
    const flagJson = await flagRes.json()
    setSavingPass(false)
    if (!flagRes.ok) {
      setPassMsg({ ok: false, text: `Error al actualizar: ${flagJson.error ?? flagRes.status}` })
      return
    }
    setPassMsg({ ok: true, text: "Contraseña actualizada" })
    setNewPass("")
    setConfirmPass("")
  }

  /* ── Usuarios ── */
  const [users,        setUsers]        = useState<ProfileRow[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [togglingId,   setTogglingId]   = useState<string | null>(null)
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null)
  const [usersError,   setUsersError]   = useState<string | null>(null)

  /* ── Crear usuario ── */
  const [createOpen,     setCreateOpen]     = useState(false)
  const [newUser,        setNewUser]        = useState({ nombre: "", email: "", role: "operador" as UserRole })
  const [createPermisos, setCreatePermisos] = useState<string[]>(ROLE_MODULE_DEFAULTS["operador"])
  const [creating,       setCreating]       = useState(false)
  const [createMsg,      setCreateMsg]      = useState<{ ok: boolean; text: string } | null>(null)
  const [createdPassword, setCreatedPassword] = useState<string | null>(null)

  /* ── Eliminar usuario ── */
  const [deleteTarget,  setDeleteTarget]  = useState<ProfileRow | null>(null)
  const [deleting,      setDeleting]      = useState(false)
  const [deleteMsg,     setDeleteMsg]     = useState<{ ok: boolean; text: string } | null>(null)

  /* ── Editar permisos ── */
  const [permisosUser,   setPermisosUser]   = useState<ProfileRow | null>(null)
  const [editPermisos,   setEditPermisos]   = useState<string[]>([])
  const [savingPermisos, setSavingPermisos] = useState(false)
  const [permisosMsg,    setPermisosMsg]    = useState<{ ok: boolean; text: string } | null>(null)

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true)
    setUsersError(null)
    const res = await fetch("/api/admin/users")
    if (res.ok) {
      const data = await res.json()
      setUsers(data as ProfileRow[])
    } else {
      setUsersError("No se pudo cargar la lista de usuarios.")
    }
    setLoadingUsers(false)
  }, [])

  useEffect(() => { if (tab === "usuarios" && isSuperAdmin) fetchUsers() }, [tab, isSuperAdmin, fetchUsers])

  async function handleToggleActivo(u: ProfileRow) {
    setTogglingId(u.id)
    setUsersError(null)
    const res = await fetch("/api/admin/update-user", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ id: u.id, activo: !u.activo }),
    })
    if (res.ok) {
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, activo: !u.activo } : x))
    } else {
      const json = await res.json()
      setUsersError(json.error ?? "Error al cambiar el estado del usuario.")
    }
    setTogglingId(null)
  }

  async function handleChangeRole(id: string, newRole: UserRole) {
    setSavingRoleId(id)
    setUsersError(null)
    const res = await fetch("/api/admin/update-user", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ id, role: newRole }),
    })
    if (res.ok) {
      setUsers(prev => prev.map(x => x.id === id ? { ...x, role: newRole } : x))
    } else {
      const json = await res.json()
      setUsersError(json.error ?? "Error al cambiar el rol.")
    }
    setSavingRoleId(null)
  }

  async function handleCreateUser() {
    setCreating(true); setCreateMsg(null); setCreatedPassword(null)
    const res  = await fetch("/api/admin/create-user", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ ...newUser, permisos: createPermisos }),
    })
    const json = await res.json()
    setCreating(false)
    if (!res.ok) {
      setCreateMsg({ ok: false, text: json.error })
    } else {
      setCreateMsg({ ok: true, text: "Usuario creado correctamente" })
      setCreatedPassword(json.tempPassword ?? null)
      setNewUser({ nombre: "", email: "", role: "operador" })
      setCreatePermisos(ROLE_MODULE_DEFAULTS["operador"])
      fetchUsers()
    }
  }

  async function handleDeleteUser() {
    if (!deleteTarget) return
    setDeleting(true); setDeleteMsg(null)
    const res  = await fetch("/api/admin/delete-user", {
      method:  "DELETE",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ targetId: deleteTarget.id }),
    })
    const json = await res.json()
    setDeleting(false)
    if (!res.ok) { setDeleteMsg({ ok: false, text: json.error }) }
    else {
      setUsers(prev => prev.filter(x => x.id !== deleteTarget.id))
      setDeleteTarget(null)
    }
  }

  function openPermisosDialog(u: ProfileRow) {
    setPermisosUser(u)
    setEditPermisos(u.permisos ?? ROLE_MODULE_DEFAULTS[u.role])
    setPermisosMsg(null)
  }

  async function handleSavePermisos() {
    if (!permisosUser) return
    setSavingPermisos(true); setPermisosMsg(null)
    const res = await fetch("/api/admin/update-user", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ id: permisosUser.id, permisos: editPermisos }),
    })
    const json = await res.json()
    setSavingPermisos(false)
    if (!res.ok) {
      setPermisosMsg({ ok: false, text: json.error ?? "Error al actualizar accesos." })
    } else {
      setUsers(prev => prev.map(x => x.id === permisosUser.id ? { ...x, permisos: editPermisos } : x))
      setPermisosMsg({ ok: true, text: "Accesos actualizados" })
      setTimeout(() => { setPermisosUser(null); setPermisosMsg(null) }, 1200)
    }
  }

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "perfil",   label: "Mi perfil", icon: <User className="h-4 w-4" /> },
    ...(isSuperAdmin ? [{ key: "usuarios" as Tab, label: "Usuarios", icon: <Users className="h-4 w-4" /> }] : []),
  ]

  return (
    <>
    <div className="flex h-full overflow-hidden">

      {/* ── Sidebar de navegación ── */}
      <aside className="w-52 flex-shrink-0 border-r bg-muted/20 p-3 flex flex-col gap-1">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-3 pt-2 pb-1">Configuración</p>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all text-left w-full",
              tab === t.key
                ? "bg-[oklch(0.35_0.12_240)] text-white shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </aside>

      {/* ── Contenido ── */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-8 py-8 space-y-6">

          {/* ─── Tab Perfil ─── */}
          {tab === "perfil" && (
            <>
              {profile?.must_change_password && (
                <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold">Debes cambiar tu contraseña</p>
                    <p className="text-xs mt-0.5 text-amber-700">Por seguridad, actualiza tu contraseña antes de acceder a la aplicación.</p>
                  </div>
                </div>
              )}
              <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                <div className="bg-gradient-to-r from-[oklch(0.35_0.12_240)] to-[oklch(0.45_0.15_260)] px-6 py-5">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-14 w-14 ring-2 ring-white/40">
                      <AvatarFallback className="bg-white/20 text-white text-lg font-bold backdrop-blur-sm">
                        {nombre ? initials(nombre) : "??"}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-bold text-white text-base leading-tight">{nombre || "—"}</p>
                      <p className="text-white/70 text-xs mt-0.5">{user?.email}</p>
                      {role && (
                        <div className="flex items-center gap-1 mt-1.5 bg-white/20 rounded-full px-2 py-0.5 w-fit">
                          {ROLE_ICON[role]}
                          <span className="text-white text-[10px] font-semibold">{ROLE_LABELS[role]}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-6 space-y-4">
                  <div className="flex items-center gap-2 mb-1">
                    <UserCog className="h-4 w-4 text-muted-foreground" />
                    <h2 className="text-sm font-bold text-foreground">Información personal</h2>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <Field label="Nombre completo">
                        <Input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Tu nombre completo" className="h-9" />
                      </Field>
                    </div>
                    <div className="col-span-2">
                      <Field label="Correo electrónico">
                        <Input value={user?.email ?? ""} readOnly className="h-9 bg-muted/40 cursor-not-allowed opacity-70" />
                      </Field>
                    </div>
                  </div>
                  <StatusMsg msg={perfilMsg} />
                  <div className="flex justify-end pt-1">
                    <Button onClick={handleSavePerfil} disabled={savingPerfil} size="sm"
                      className="gap-1.5 bg-[oklch(0.35_0.12_240)] hover:bg-[oklch(0.30_0.12_240)] text-white px-5">
                      {savingPerfil ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      Guardar cambios
                    </Button>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border bg-card shadow-sm p-6 space-y-4">
                <div className="flex items-center gap-2 pb-3 border-b">
                  <KeyRound className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <h2 className="text-sm font-bold text-foreground">Cambiar contraseña</h2>
                    <p className="text-xs text-muted-foreground">Mínimo 8 caracteres</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Nueva contraseña">
                    <div className="relative">
                      <Input type={showPass ? "text" : "password"} value={newPass} onChange={e => setNewPass(e.target.value)}
                        placeholder="••••••••" className="h-9 pr-9" />
                      <button onClick={() => setShowPass(!showPass)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                        {showPass ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </Field>
                  <Field label="Confirmar contraseña">
                    <Input
                      type={showPass ? "text" : "password"}
                      value={confirmPass}
                      onChange={e => setConfirmPass(e.target.value)}
                      placeholder="••••••••"
                      className={cn(
                        "h-9",
                        confirmPass && newPass !== confirmPass && "border-red-400 focus-visible:ring-red-400"
                      )}
                    />
                    {confirmPass && newPass !== confirmPass && (
                      <p className="text-[11px] text-red-500 mt-1">Las contraseñas no coinciden</p>
                    )}
                  </Field>
                </div>
                <StatusMsg msg={passMsg} />
                <div className="flex justify-end">
                  <Button
                    onClick={handleChangePassword}
                    disabled={savingPass || !newPass || !confirmPass || newPass !== confirmPass || newPass.length < 8}
                    size="sm"
                    className="gap-1.5 bg-[oklch(0.35_0.12_240)] hover:bg-[oklch(0.30_0.12_240)] text-white px-5">
                    {savingPass ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                    Actualizar contraseña
                  </Button>
                </div>
              </div>
            </>
          )}

          {/* ─── Tab Usuarios ─── */}
          {tab === "usuarios" && isSuperAdmin && (
            <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b bg-muted/20">
                <div>
                  <h2 className="text-sm font-bold text-foreground">Gestión de usuarios</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {users.length} usuario{users.length !== 1 ? "s" : ""} registrado{users.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <Button size="sm" onClick={() => { setCreateMsg(null); setCreatedPassword(null); setCreateOpen(true) }}
                  className="gap-1.5 bg-[oklch(0.35_0.12_240)] hover:bg-[oklch(0.30_0.12_240)] text-white">
                  <Plus className="h-3.5 w-3.5" />
                  Nuevo usuario
                </Button>
              </div>

              {usersError && (
                <div className="mx-5 mt-4">
                  <StatusMsg msg={{ ok: false, text: usersError }} />
                </div>
              )}

              {loadingUsers ? (
                <div className="flex items-center justify-center h-40">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div>
                  {/* Cabecera columnas */}
                  <div className="flex items-center gap-3 px-6 py-2.5 border-b bg-muted/30">
                    <div className="flex-1 min-w-0 pl-11 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Usuario</div>
                    <div className="hidden sm:block w-36 flex-shrink-0 text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-center">Rol</div>
                    <div className="w-24 flex-shrink-0 text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-center">Estado</div>
                    <div className="hidden lg:block w-24 flex-shrink-0 text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-center">Accesos</div>
                    <div className="w-8 flex-shrink-0" />
                  </div>

                  {/* Filas */}
                  <div className="divide-y divide-border">
                    {users.length === 0 && (
                      <p className="px-6 py-12 text-center text-sm text-muted-foreground">No hay usuarios registrados</p>
                    )}
                    {users.map(u => (
                      <div key={u.id} className="flex items-center gap-3 px-6 py-3.5 hover:bg-muted/20 transition-colors">

                        {/* Identidad */}
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <Avatar className="h-8 w-8 flex-shrink-0">
                            <AvatarFallback className={cn(
                              "text-xs font-bold text-white",
                              u.id === user?.id ? "bg-[oklch(0.35_0.12_240)]" : "bg-slate-400"
                            )}>
                              {initials(u.nombre)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="font-semibold text-foreground text-xs leading-none">{u.nombre}</p>
                              {u.id === user?.id && (
                                <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground leading-none">tú</span>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground truncate mt-0.5">{u.email}</p>
                            {/* Rol en mobile (sm-) */}
                            <p className="text-[10px] text-muted-foreground/70 mt-0.5 sm:hidden">{ROLE_LABELS[u.role]}</p>
                          </div>
                        </div>

                        {/* Rol — select en sm+ */}
                        <div className="hidden sm:block w-36 flex-shrink-0">
                          {savingRoleId === u.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground mx-auto" />
                            : (
                              <select
                                value={u.role}
                                disabled={u.id === user?.id}
                                onChange={e => handleChangeRole(u.id, e.target.value as UserRole)}
                                className="h-7 w-full rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                              </select>
                            )
                          }
                        </div>

                        {/* Estado */}
                        <div className="w-24 flex-shrink-0 flex justify-center">
                          <button
                            onClick={() => u.id !== user?.id && handleToggleActivo(u)}
                            disabled={togglingId === u.id || u.id === user?.id}
                            className={cn(
                              "inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full transition-all",
                              u.activo
                                ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400"
                                : "bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400",
                              u.id === user?.id && "cursor-not-allowed opacity-50"
                            )}
                          >
                            {togglingId === u.id
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : u.activo
                                ? <><CheckCircle2 className="h-3 w-3" />Activo</>
                                : <><XCircle className="h-3 w-3" />Inactivo</>
                            }
                          </button>
                        </div>

                        {/* Accesos — lg+ */}
                        <div className="hidden lg:flex w-24 flex-shrink-0 justify-center">
                          {u.role === "super_admin" ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                              <ShieldCheck className="h-3 w-3" />Todos
                            </span>
                          ) : (
                            <button
                              onClick={() => openPermisosDialog(u)}
                              title="Editar accesos al menú lateral"
                              className={cn(
                                "inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-md transition-colors",
                                u.permisos
                                  ? "bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400"
                                  : "bg-muted text-muted-foreground hover:bg-muted/70"
                              )}
                            >
                              <LayoutGrid className="h-3 w-3" />
                              {u.permisos ? `${u.permisos.length}` : "Rol"}
                            </button>
                          )}
                        </div>

                        {/* Eliminar */}
                        <div className="w-8 flex-shrink-0 flex justify-center">
                          {u.id !== user?.id && (
                            <button
                              onClick={() => { setDeleteMsg(null); setDeleteTarget(u) }}
                              title="Eliminar usuario"
                              className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:bg-red-100 hover:text-red-600 transition-colors dark:hover:bg-red-900/30 dark:hover:text-red-400"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>

                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>

    {/* ── Dialog crear usuario ── */}
    <Dialog open={createOpen} onOpenChange={open => { if (!open) { setCreateOpen(false); setCreatedPassword(null); setCreateMsg(null) } }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo usuario</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <Field label="Nombre completo">
            <Input value={newUser.nombre} onChange={e => setNewUser(p => ({ ...p, nombre: e.target.value }))} placeholder="Nombre completo" className="h-9" />
          </Field>
          <Field label="Correo electrónico">
            <Input type="email" value={newUser.email} onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))} placeholder="correo@ejemplo.com" className="h-9" />
          </Field>
          <Field label="Rol">
            <select
              value={newUser.role}
              onChange={e => {
                const r = e.target.value as UserRole
                setNewUser(p => ({ ...p, role: r }))
                setCreatePermisos(ROLE_MODULE_DEFAULTS[r])
              }}
              className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </Field>

          <div className="border rounded-lg p-3 space-y-2 bg-muted/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <LayoutGrid className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-foreground">Accesos al menú lateral</span>
              </div>
              {newUser.role !== "super_admin" && (
                <button
                  type="button"
                  onClick={() => setCreatePermisos(ROLE_MODULE_DEFAULTS[newUser.role])}
                  className="text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2"
                >
                  Restablecer a rol
                </button>
              )}
            </div>
            {newUser.role === "super_admin" ? (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 px-1 py-1">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                Los Super Admin tienen acceso completo a todos los módulos.
              </p>
            ) : (
              <ModuleCheckboxes selected={createPermisos} onChange={setCreatePermisos} />
            )}
          </div>

          {createdPassword && (
            <CopyablePassword password={createdPassword} />
          )}

          <StatusMsg msg={createMsg} />
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => { setCreateOpen(false); setCreatedPassword(null); setCreateMsg(null) }}>
            {createdPassword ? "Cerrar" : "Cancelar"}
          </Button>
          {!createdPassword && (
            <Button size="sm" disabled={creating || !newUser.nombre || !newUser.email}
              onClick={handleCreateUser}
              className="gap-1.5 bg-[oklch(0.35_0.12_240)] hover:bg-[oklch(0.30_0.12_240)] text-white">
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Crear usuario
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* ── Dialog eliminar usuario ── */}
    <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null) }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-4 w-4" />
            Eliminar usuario
          </DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-3">
          <p className="text-sm text-muted-foreground">
            ¿Estás seguro de que deseas eliminar a{" "}
            <span className="font-semibold text-foreground">{deleteTarget?.nombre}</span>?
            Esta acción no se puede deshacer.
          </p>
          <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{deleteTarget?.email}</span>
            {" · "}
            {deleteTarget ? ROLE_LABELS[deleteTarget.role] : ""}
          </div>
          <StatusMsg msg={deleteMsg} />
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)} disabled={deleting}>
            Cancelar
          </Button>
          <Button size="sm" disabled={deleting} onClick={handleDeleteUser}
            className="gap-1.5 bg-destructive hover:bg-destructive/90 text-destructive-foreground">
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Eliminar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* ── Dialog editar accesos ── */}
    <Dialog open={!!permisosUser} onOpenChange={open => { if (!open) setPermisosUser(null) }}>
      <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutGrid className="h-4 w-4" />
            Accesos — {permisosUser?.nombre}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>Rol: <strong className="text-foreground">{permisosUser ? ROLE_LABELS[permisosUser.role] : ""}</strong></span>
            <button
              type="button"
              onClick={() => permisosUser && setEditPermisos(ROLE_MODULE_DEFAULTS[permisosUser.role])}
              className="text-[10px] underline underline-offset-2 hover:text-foreground"
            >
              Restablecer a rol
            </button>
          </div>
          <ModuleCheckboxes selected={editPermisos} onChange={setEditPermisos} />
          <StatusMsg msg={permisosMsg} />
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setPermisosUser(null)}>Cancelar</Button>
          <Button size="sm" disabled={savingPermisos} onClick={handleSavePermisos}
            className="gap-1.5 bg-[oklch(0.35_0.12_240)] hover:bg-[oklch(0.30_0.12_240)] text-white">
            {savingPermisos ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
