'use client';

export const runtime = 'edge';

import Link from "next/link";
import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  useId,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type SyntheticEvent
} from "react";
import { useSearchParams } from "next/navigation";
import type { OwnerDetail, OwnerSearchResult, FriendshipListItem, FriendshipStatus, OwnerPetSummary } from "@/lib/types";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import { TAIWAN_CITIES } from "@/data/taiwan-districts";

type CropTarget = "front" | "back";

type CropState = {
  target: CropTarget | null;
  imageUrl: string | null;
  file: File | null;
  scale: number;
  baseScale: number;
  offset: { x: number; y: number };
  naturalWidth: number;
  naturalHeight: number;
};

const CROP_CANVAS_WIDTH = 857;
const CROP_CANVAS_HEIGHT = 540;

function createInitialCropState(): CropState {
  return {
    target: null,
    imageUrl: null,
    file: null,
    scale: 1,
    baseScale: 1,
    offset: { x: 0, y: 0 },
    naturalWidth: 0,
    naturalHeight: 0
  };
}

export default function OwnerPage() {
  return (
    <Suspense fallback={<PageShell loading ownerId="" onUpdated={() => {}} />}>
      <OwnerContent />
    </Suspense>
  );
}

function OwnerContent() {
  const searchParams = useSearchParams();
  const ownerId = useMemo(() => searchParams.get("id") || "", [searchParams]);

  const [owner, setOwner] = useState<OwnerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ownerId) {
      setOwner(null);
      setError("Missing owner id.");
      return;
    }
    setLoading(true);
    setError(null);
    fetchOwner(ownerId)
      .then(({ owner, error }) => {
        setOwner(owner);
        setError(error);
      })
      .finally(() => setLoading(false));
  }, [ownerId]);

  return <PageShell loading={loading} error={error} owner={owner} ownerId={ownerId} onUpdated={setOwner} />;
}

function PageShell({
  loading,
  error,
  owner,
  ownerId,
  onUpdated
}: {
  loading?: boolean;
  error?: string | null;
  owner?: OwnerDetail | null;
  ownerId: string;
  onUpdated: (owner: OwnerDetail | null) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [csvData, setCsvData] = useState<Array<{ city: string; region: string }>>([]);
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [idFrontPreview, setIdFrontPreview] = useState<string | null>(null);
  const [idBackPreview, setIdBackPreview] = useState<string | null>(null);
  const [idSelfiePreview, setIdSelfiePreview] = useState<string | null>(null);
  const [selfieAspectRatio, setSelfieAspectRatio] = useState<number | null>(null);
  const [idFrontFile, setIdFrontFile] = useState<File | null>(null);
  const [idBackFile, setIdBackFile] = useState<File | null>(null);
  const [idSelfieFile, setIdSelfieFile] = useState<File | null>(null);
  const [cropState, setCropState] = useState<CropState>(createInitialCropState);
  const [cropBoxSize, setCropBoxSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0
  });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const cropBoxRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const { user } = useAuth();
  const isSelf = Boolean(user && user.id === ownerId);
  const [friendshipStatus, setFriendshipStatus] = useState<FriendshipStatus>("none");
  const [friendshipLoading, setFriendshipLoading] = useState(false);
  const [friendshipError, setFriendshipError] = useState<string | null>(null);
  const [requestsTab, setRequestsTab] = useState<"incoming" | "outgoing">("incoming");
  const [incomingRequests, setIncomingRequests] = useState<FriendshipListItem[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendshipListItem[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [ownerPets, setOwnerPets] = useState<OwnerPetSummary[]>([]);
  const [ownerPetsLoading, setOwnerPetsLoading] = useState(false);
  const [ownerPetsError, setOwnerPetsError] = useState<string | null>(null);

  useEffect(() => {
    if (!showForm || csvData.length > 0) return;
    setCsvData(
      TAIWAN_CITIES.flatMap((c) => c.regions.map((r) => ({ city: c.code, region: r.code })))
    );
  }, [showForm, csvData.length]);

  useEffect(() => {
    if (!ownerId || !user || isSelf) {
      setFriendshipStatus("none");
      setFriendshipError(null);
      setFriendshipLoading(false);
      return;
    }
    setFriendshipLoading(true);
    setFriendshipError(null);
    apiFetch<{ status: FriendshipStatus }>(`/api/owners/${ownerId}/friendship/status`)
      .then(({ data }) => setFriendshipStatus(data.status ?? "none"))
      .catch((err) => {
        const status = (err as { status?: number }).status;
        setFriendshipError("Failed to load friendship status (" + (status ?? "?") + ")");
      })
      .finally(() => setFriendshipLoading(false));
  }, [ownerId, user, isSelf]);

  useEffect(() => {
    if (!user || !isSelf) {
      setIncomingRequests([]);
      setOutgoingRequests([]);
      setRequestsLoading(false);
      setRequestsError(null);
      return;
    }
    refreshFriendRequests();
  }, [user, isSelf]);

  useEffect(() => {
    if (!ownerId) {
      setOwnerPets([]);
      setOwnerPetsLoading(false);
      setOwnerPetsError(null);
      return;
    }
    setOwnerPetsLoading(true);
    setOwnerPetsError(null);
    apiFetch<{ items: OwnerPetSummary[] }>(`/api/owners/${ownerId}/pets`)
      .then(({ data }) => setOwnerPets(data.items ?? []))
      .catch((err) => {
        const status = (err as { status?: number }).status;
        setOwnerPetsError("Failed to load pets (" + (status ?? "?") + ")");
      })
      .finally(() => setOwnerPetsLoading(false));
  }, [ownerId]);

  const cities = useMemo(() => TAIWAN_CITIES, []);
  const regions = useMemo(
    () => (city ? cities.find((c) => c.code === city)?.regions ?? [] : []),
    [city, cities]
  );
  const isCropping = Boolean(cropState.target && cropState.imageUrl);
  const minScale = cropState.baseScale || 1;
  const maxScale = minScale * 3;
  const clampedScale = Math.min(Math.max(cropState.scale, minScale), maxScale);
  const selfieBoxStyle: CSSProperties =
    selfieAspectRatio && selfieAspectRatio > 0
      ? {
          width: "100%",
          maxWidth: "100%",
          aspectRatio: selfieAspectRatio,
          maxHeight: "500px"
        }
      : { minHeight: "200px" };
  const requestItems = requestsTab === "incoming" ? incomingRequests : outgoingRequests;
  const otherOwner: OwnerSearchResult | null = owner
    ? {
        uuid: owner.uuid,
        displayName: owner.displayName,
        avatarUrl: owner.avatarUrl ?? null,
        city: owner.city ?? null,
        region: owner.region ?? null
      }
    : null;
  const otherLocation = owner ? [owner.city, owner.region].filter(Boolean).join(" / ") : "";

  useEffect(() => {
    if (!isCropping) return;
    const updateSize = () => {
      if (!cropBoxRef.current) return;
      const rect = cropBoxRef.current.getBoundingClientRect();
      setCropBoxSize({ width: rect.width, height: rect.height });
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, [isCropping]);

  useEffect(() => {
    if (!isCropping || !cropBoxSize.width || !cropState.naturalWidth || !cropState.naturalHeight) return;
    const nextBaseScale = Math.max(
      cropBoxSize.width / cropState.naturalWidth,
      cropBoxSize.height / cropState.naturalHeight
    );
    setCropState((prev) => {
      const hasSameBase = Math.abs(prev.baseScale - nextBaseScale) < 0.0001;
      const nextScale = Math.max(nextBaseScale, prev.scale);
      if (hasSameBase && prev.scale === nextScale && prev.offset.x === 0 && prev.offset.y === 0) {
        return prev;
      }
      return {
        ...prev,
        baseScale: nextBaseScale,
        scale: nextScale,
        offset: { x: 0, y: 0 }
      };
    });
  }, [
    cropBoxSize.height,
    cropBoxSize.width,
    cropState.naturalHeight,
    cropState.naturalWidth,
    isCropping
  ]);

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: PointerEvent) => {
      if (!dragStartRef.current) return;
      const deltaX = e.clientX - dragStartRef.current.startX;
      const deltaY = e.clientY - dragStartRef.current.startY;
      setCropState((prev) => ({
        ...prev,
        offset: {
          x: dragStartRef.current!.originX + deltaX,
          y: dragStartRef.current!.originY + deltaY
        }
      }));
    };
    const stopDrag = () => {
      setDragging(false);
      dragStartRef.current = null;
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", stopDrag);
      window.removeEventListener("pointercancel", stopDrag);
    };
  }, [dragging]);

  function startCrop(target: CropTarget, file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCropState({
        target,
        imageUrl: reader.result as string,
        file,
        scale: 1,
        baseScale: 1,
        offset: { x: 0, y: 0 },
        naturalWidth: 0,
        naturalHeight: 0
      });
    };
    reader.readAsDataURL(file);
  }

  function handleSelfieChange(file: File | null) {
    setIdSelfieFile(file);
    if (!file) {
      setIdSelfiePreview(null);
      setSelfieAspectRatio(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setIdSelfiePreview(dataUrl);
      const img = new Image();
      img.onload = () => {
        if (!img.naturalWidth || !img.naturalHeight) {
          setSelfieAspectRatio(null);
          return;
        }
        setSelfieAspectRatio(img.naturalWidth / img.naturalHeight);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  function closeCropper() {
    setCropState(createInitialCropState());
    setDragging(false);
    dragStartRef.current = null;
  }

  function handleCropPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault();
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: cropState.offset.x,
      originY: cropState.offset.y
    };
    setDragging(true);
  }

  function handleCropImageLoad(e: SyntheticEvent<HTMLImageElement>) {
    const imgEl = e.currentTarget;
    if (!imgEl.naturalWidth || !imgEl.naturalHeight) return;
    setCropState((prev) => {
      if (prev.naturalWidth === imgEl.naturalWidth && prev.naturalHeight === imgEl.naturalHeight) {
        return prev;
      }
      return {
        ...prev,
        naturalWidth: imgEl.naturalWidth,
        naturalHeight: imgEl.naturalHeight
      };
    });
  }

  function handleZoomChange(nextScale: number) {
    setCropState((prev) => ({
      ...prev,
      scale: Math.min(Math.max(nextScale, minScale), maxScale)
    }));
  }

  async function confirmCrop() {
    if (!cropState.target || !cropState.imageUrl || !cropBoxRef.current) {
      closeCropper();
      return;
    }
    const img = new Image();
    img.src = cropState.imageUrl;
    if (!img.complete) {
      await new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
      });
    }
    if (!img.naturalWidth || !img.naturalHeight) {
      closeCropper();
      return;
    }

    const rect = cropBoxRef.current.getBoundingClientRect();
    const imgLeft = rect.width / 2 - (img.naturalWidth * cropState.scale) / 2 + cropState.offset.x;
    const imgTop = rect.height / 2 - (img.naturalHeight * cropState.scale) / 2 + cropState.offset.y;
    const sourceX = (0 - imgLeft) / cropState.scale;
    const sourceY = (0 - imgTop) / cropState.scale;
    const sourceW = rect.width / cropState.scale;
    const sourceH = rect.height / cropState.scale;

    const canvas = document.createElement("canvas");
    canvas.width = CROP_CANVAS_WIDTH;
    canvas.height = CROP_CANVAS_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      closeCropper();
      return;
    }

    ctx.drawImage(
      img,
      sourceX,
      sourceY,
      sourceW,
      sourceH,
      0,
      0,
      CROP_CANVAS_WIDTH,
      CROP_CANVAS_HEIGHT
    );

    const dataUrl = canvas.toDataURL("image/png");
    if (cropState.target === "front") {
      setIdFrontPreview(dataUrl);
      setIdFrontFile(cropState.file);
    } else {
      setIdBackPreview(dataUrl);
      setIdBackFile(cropState.file);
    }
    closeCropper();
  }

  function dataUrlToFile(dataUrl: string, filename: string): File {
    const [head, body] = dataUrl.split(",");
    const mime = head?.match(/data:(.*?);base64/)?.[1] ?? "image/png";
    const binary = atob(body ?? "");
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new File([bytes], filename, { type: mime });
  }

  async function uploadVerificationDocs() {
    if (!owner) {
      setUploadError("Load the owner profile first.");
      return;
    }
    if (!idFrontPreview || !idBackPreview || !idSelfiePreview) {
      setUploadError("Upload all three verification photos.");
      return;
    }
    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);
    try {
      const form = new FormData();
      form.append(
        "id_license_front",
        dataUrlToFile(idFrontPreview, owner.accountId + "_id_license_front.png")
      );
      form.append(
        "id_license_back",
        dataUrlToFile(idBackPreview, owner.accountId + "_id_license_back.png")
      );
      form.append(
        "face_with_license",
        dataUrlToFile(idSelfiePreview, owner.accountId + "_face_with_license.png")
      );

      const { data } = await apiFetch<{
        idLicenseFrontUrl: string;
        idLicenseBackUrl: string;
        faceWithLicenseUrl: string;
      }>(`/api/owners/${owner.uuid}/verification-docs`, {
        method: "POST",
        body: form
      });

      const nextOwner = {
        ...owner,
        idLicenseFrontUrl: data.idLicenseFrontUrl,
        idLicenseBackUrl: data.idLicenseBackUrl,
        faceWithLicenseUrl: data.faceWithLicenseUrl
      };
      onUpdated(nextOwner);
      setUploadSuccess("銝摰?");
    } catch (err) {
      const status = (err as { status?: number }).status;
      const details = (err as { details?: unknown }).details;
      setUploadError("Upload failed (" + (status ?? "?") + "): " + (typeof details === "string" ? details : JSON.stringify(details)));
    } finally {
      setUploading(false);
    }
  }

  async function refreshFriendRequests() {
    if (!user) return;
    setRequestsLoading(true);
    setRequestsError(null);
    try {
      const [incoming, outgoing] = await Promise.all([
        apiFetch<{ items: FriendshipListItem[] }>("/api/friendships/incoming"),
        apiFetch<{ items: FriendshipListItem[] }>("/api/friendships/outgoing")
      ]);
      setIncomingRequests(incoming.data.items ?? []);
      setOutgoingRequests(outgoing.data.items ?? []);
    } catch (err) {
      const status = (err as { status?: number }).status;
      setRequestsError("Failed to load friend requests (" + (status ?? "?") + ")");
    } finally {
      setRequestsLoading(false);
    }
  }

  async function runFriendAction(method: "POST" | "DELETE", path: string, fallbackStatus: FriendshipStatus) {
    setFriendshipLoading(true);
    setFriendshipError(null);
    try {
      const { data } = await apiFetch<{ status: FriendshipStatus }>(path, { method });
      setFriendshipStatus(data.status ?? fallbackStatus);
    } catch (err) {
      const status = (err as { status?: number }).status;
      setFriendshipError("Friend action failed (" + (status ?? "?") + ")");
    } finally {
      setFriendshipLoading(false);
    }
  }

  async function handleSendRequest() {
    await runFriendAction("POST", `/api/owners/${ownerId}/friend-request`, "pending_outgoing");
  }

  async function handleCancelRequest(target: OwnerSearchResult) {
    const name = target.displayName || "撠";
    if (!window.confirm("Cancel friend request to " + name + "?")) return;
    await runFriendAction("DELETE", `/api/owners/${target.uuid}/friend-request`, "none");
  }

  async function handleAcceptRequest(target: OwnerSearchResult) {
    const name = target.displayName || "撠";
    if (!window.confirm("Accept friend request from " + name + "?")) return;
    await runFriendAction("POST", `/api/owners/${target.uuid}/friend-request/accept`, "friends");
  }

  async function handleRejectRequest(target: OwnerSearchResult) {
    const name = target.displayName || "撠";
    if (!window.confirm("Reject friend request from " + name + "?")) return;
    await runFriendAction("DELETE", `/api/owners/${target.uuid}/friend-request/reject`, "none");
  }

  async function handleUnfriend(target: OwnerSearchResult) {
    const name = target.displayName || "撠";
    if (!window.confirm("Unfriend " + name + "?")) return;
    await runFriendAction("DELETE", `/api/owners/${target.uuid}/friendship`, "none");
  }

  async function handleIncomingItemAccept(item: FriendshipListItem) {
    const name = item.otherOwner.displayName || "撠";
    if (!window.confirm("Accept friend request from " + name + "?")) return;
    try {
      await apiFetch(`/api/owners/${item.otherOwner.uuid}/friend-request/accept`, { method: "POST" });
      await refreshFriendRequests();
    } catch (err) {
      const status = (err as { status?: number }).status;
      setRequestsError("Friend request action failed (" + (status ?? "?") + ")");
    }
  }

  async function handleIncomingItemReject(item: FriendshipListItem) {
    const name = item.otherOwner.displayName || "撠";
    if (!window.confirm("Reject friend request from " + name + "?")) return;
    try {
      await apiFetch(`/api/owners/${item.otherOwner.uuid}/friend-request/reject`, { method: "DELETE" });
      await refreshFriendRequests();
    } catch (err) {
      const status = (err as { status?: number }).status;
      setRequestsError("Friend request action failed (" + (status ?? "?") + ")");
    }
  }

  async function handleOutgoingItemCancel(item: FriendshipListItem) {
    const name = item.otherOwner.displayName || "撠";
    if (!window.confirm("Cancel friend request to " + name + "?")) return;
    try {
      await apiFetch(`/api/owners/${item.otherOwner.uuid}/friend-request`, { method: "DELETE" });
      await refreshFriendRequests();
    } catch (err) {
      const status = (err as { status?: number }).status;
      setRequestsError("Friend request action failed (" + (status ?? "?") + ")");
    }
  }

  async function saveLocation() {
    if (!city || !region || !ownerId) {
      setSaveError("Select a city and region first.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const { data } = await apiFetch<OwnerDetail>(`/api/owners/${ownerId}/location`, {
        method: "POST",
        body: JSON.stringify({ city, region })
      });
      onUpdated(data);
      setShowForm(false);
    } catch (err) {
      const status = (err as { status?: number }).status;
      const details = (err as { details?: unknown }).details;
      setSaveError("Update failed (" + (status ?? "?") + "): " + (typeof details === "string" ? details : JSON.stringify(details)));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/" className="text-sm text-white/80 hover:text-white">
          Back to home
        </Link>
        <h1 className="text-xl font-semibold text-white">Owner profile</h1>
      </div>

      <section className="rounded-xl border border-white/10 bg-white/90 p-4 shadow-sm">
        {loading && <p className="text-sm text-slate-600">Loading...</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!error && !owner && !loading && <p className="text-sm text-slate-600">No owner found.</p>}
        {owner && (
          <div className="space-y-2 text-sm text-slate-800">
            <p>
              <span className="font-medium text-slate-600">UUID:</span>
              <span className="font-mono text-slate-900 break-all">{owner.uuid}</span>
            </p>
            <p>
              <span className="font-medium text-slate-600">Email:</span>
              {owner.email || "(not set)"}
            </p>
            <p>
              <span className="font-medium text-slate-600">Display name:</span>
              {owner.displayName}
            </p>
            <p>
              <span className="font-medium text-slate-600">Avatar:</span>
              {owner.avatarUrl || "(not set)"}
            </p>
            <p>
              <span className="font-medium text-slate-600">Max pets:</span>
              {owner.maxPets}
            </p>
            <p>
              <span className="font-medium text-slate-600">Created at:</span>
              {owner.createdAt}
            </p>
            <p>
              <span className="font-medium text-slate-600">Updated at:</span>
              {owner.updatedAt}
            </p>
            <p>
              <span className="font-medium text-slate-600">Status:</span>
              {owner.isActive ? "Active" : "Inactive"}
            </p>
          </div>
        )}
      </section>

      {owner && !isSelf && otherOwner && (
        <section className="rounded-xl border border-white/10 bg-white/90 p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-slate-900">Friendship</h2>
              <p className="text-sm text-slate-700">{owner.displayName}</p>
              <p className="text-xs text-slate-500">{otherLocation || "Location not set."}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!user && <span className="text-xs text-slate-500">Log in to manage friendship.</span>}
              {user && friendshipStatus === "none" && (
                <button
                  type="button"
                  onClick={handleSendRequest}
                  disabled={friendshipLoading}
                  className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  Add friend                </button>
              )}
              {user && friendshipStatus === "pending_outgoing" && (
                <button
                  type="button"
                  onClick={() => handleCancelRequest(otherOwner)}
                  disabled={friendshipLoading}
                  className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                >
                  Request sent                </button>
              )}
              {user && friendshipStatus === "friends" && (
                <button
                  type="button"
                  onClick={() => handleUnfriend(otherOwner)}
                  disabled={friendshipLoading}
                  className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                >
                  Friends                </button>
              )}
              {user && friendshipStatus === "pending_incoming" && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleAcceptRequest(otherOwner)}
                    disabled={friendshipLoading}
                    className="rounded bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-500 disabled:opacity-60"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRejectRequest(otherOwner)}
                    disabled={friendshipLoading}
                    className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          </div>
          {friendshipError && <p className="mt-2 text-sm text-red-600">{friendshipError}</p>}
        </section>
      )}

      {owner && isSelf && (
        <section className="rounded-xl border border-white/10 bg-white/90 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Friend requests</h2>
              <p className="text-xs text-slate-600">Manage incoming and outgoing requests.</p>
            </div>
            <div className="flex gap-2 text-sm">
              <button
                type="button"
                onClick={() => setRequestsTab("incoming")}
                className={`rounded px-3 py-1.5 ${
                  requestsTab === "incoming"
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                Incoming              </button>
              <button
                type="button"
                onClick={() => setRequestsTab("outgoing")}
                className={`rounded px-3 py-1.5 ${
                  requestsTab === "outgoing"
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                Outgoing
              </button>
            </div>
          </div>
          {requestsError && <p className="mt-2 text-sm text-red-600">{requestsError}</p>}
          {requestsLoading && <p className="mt-2 text-sm text-slate-600">Loading...</p>}
          {!requestsLoading && requestItems.length === 0 && (
            <p className="mt-2 text-sm text-slate-600">No requests.</p>
          )}
          <div className="mt-3 space-y-2">
            {requestItems.map((item) => (
              <div
                key={item.otherOwner.uuid}
                className="flex flex-wrap items-center justify-between gap-3 rounded border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <div className="space-y-0.5">
                  <Link
                    href={`/owners?id=${encodeURIComponent(item.otherOwner.uuid)}`}
                    className="font-medium text-slate-900 hover:text-slate-700"
                  >
                    {item.otherOwner.displayName}
                  </Link>
                  <div className="text-xs text-slate-500">
                    {[item.otherOwner.city, item.otherOwner.region].filter(Boolean).join(" / ") || "Location not set."}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {requestsTab === "incoming" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleIncomingItemAccept(item)}
                        disabled={requestsLoading}
                        className="rounded bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-500 disabled:opacity-60"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() => handleIncomingItemReject(item)}
                        disabled={requestsLoading}
                        className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                      >
                        Reject
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleOutgoingItemCancel(item)}
                      disabled={requestsLoading}
                      className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                    >
                      Cancel request                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-white/10 bg-white/90 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Location</h2>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800"
          >
            {showForm ? "Hide form" : "Edit location"}
          </button>
        </div>
        {isSelf && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded border border-slate-200 bg-white px-3 py-2">
            <div>
              <p className="text-sm font-medium text-slate-800">Create a pet profile</p>
              <p className="text-xs text-slate-500">Create one to start tagging pets.</p>
            </div>
            <Link
              href="/pets/new"
              className="rounded bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-500"
            >
              Create
            </Link>
          </div>
        )}
        <div className="mt-4 space-y-2">
          <div className="text-sm font-medium text-slate-800">{isSelf ? "Your pets" : "Pets"}</div>
          {ownerPetsLoading && <p className="text-xs text-slate-500">Loading pets...</p>}
          {ownerPetsError && <p className="text-xs text-red-600">{ownerPetsError}</p>}
          {!ownerPetsLoading && !ownerPetsError && ownerPets.length === 0 && (
            <p className="text-xs text-slate-500">No pets yet.</p>
          )}
          {!ownerPetsLoading && !ownerPetsError && ownerPets.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {ownerPets.map((pet) => (
                <Link
                  key={pet.id}
                  href={`/pets?id=${encodeURIComponent(pet.id)}`}
                  className="flex items-center gap-2 rounded border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                >
                  <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
                    {pet.avatarUrl ? (
                      <img src={pet.avatarUrl} alt={pet.name} className="h-full w-full object-cover" />
                    ) : (
                      <span>{pet.name ? pet.name[0].toUpperCase() : "?"}</span>
                    )}
                  </span>
                  <span className="max-w-[140px] truncate">{pet.name}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
        {showForm && (
          <div className="mt-4 space-y-3">
            <div className="space-y-1">
              <label className="text-sm text-slate-700">City</label>
              <select
                className="w-full rounded border border-slate-200 p-2 text-sm"
                value={city}
                onChange={(e) => {
                  setCity(e.target.value);
                  setRegion("");
                }}
              >
                <option value="">Select a city</option>
                {cities.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm text-slate-700">Region</label>
              <select
                className="w-full rounded border border-slate-200 p-2 text-sm"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                disabled={!city}
              >
                <option value="">Select a region</option>
                {regions.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={saveLocation}
                disabled={saving}
                className="rounded bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-500 disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              {saveError && <span className="text-sm text-red-600">{saveError}</span>}
            </div>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-white/10 bg-white/90 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Verification</h2>
          <p className="text-xs text-slate-600">Upload the required photos for review.</p>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <FileUploadField
            label="Upload ID front"
            helper="Tap the box below (85.7mm x 54mm) to upload."
            file={idFrontFile}
            onChange={(file) => startCrop("front", file)}
            boxStyle={{ width: "85.7mm", maxWidth: "100%", height: "54mm" }}
            sizeHint="85.7mm x 54mm"
            previewUrl={idFrontPreview}
          />
          <FileUploadField
            label="Upload ID back"
            helper="Tap the box below (85.7mm x 54mm) to upload."
            file={idBackFile}
            onChange={(file) => startCrop("back", file)}
            boxStyle={{ width: "85.7mm", maxWidth: "100%", height: "54mm" }}
            sizeHint="85.7mm x 54mm"
            previewUrl={idBackPreview}
          />
          <FileUploadField
            label="Upload selfie with ID"
            helper="Any size is OK. Make sure the ID and your face are clear."
            file={idSelfieFile}
            onChange={handleSelfieChange}
            boxStyle={selfieBoxStyle}
            spanCols
            previewUrl={idSelfiePreview}
            previewFit="contain"
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={uploadVerificationDocs}
            disabled={
              uploading || !owner || !idFrontPreview || !idBackPreview || !idSelfiePreview || !owner.accountId
            }
            className="rounded bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-500 disabled:opacity-60"
          >
            {uploading ? "Uploading..." : "Upload"}
          </button>
          {uploadError && <span className="text-sm text-red-600">{uploadError}</span>}
          {uploadSuccess && !uploadError && <span className="text-sm text-emerald-600">{uploadSuccess}</span>}
        </div>
      </section>
      {isCropping && cropState.imageUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6">
          <div className="w-full max-w-4xl space-y-4 rounded-xl bg-white p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Adjust crop</h3>
                <p className="text-sm text-slate-600">
                  Drag to reposition. Use the slider to zoom so the ID fills the frame.</p>
              </div>
              <button
                type="button"
                onClick={closeCropper}
                className="rounded bg-slate-100 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-200"
              >
                Close
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
              <div className="flex flex-col items-center gap-3">
                <div
                  ref={cropBoxRef}
                  className={`relative overflow-hidden rounded-md border border-slate-200 bg-slate-100 ${
                    dragging ? "cursor-grabbing" : "cursor-grab"
                  }`}
                  style={{ width: "85.7mm", maxWidth: "100%", height: "54mm", maxHeight: "60vh" }}
                  onPointerDown={handleCropPointerDown}
                >
                  <img
                    src={cropState.imageUrl}
                    alt="Crop preview"
                    className="pointer-events-none select-none"
                    style={{
                      position: "absolute",
                      left: "50%",
                      top: "50%",
                      width: cropState.naturalWidth || "auto",
                      height: cropState.naturalHeight || "auto",
                      maxWidth: "none",
                      maxHeight: "none",
                      transform: `translate(-50%, -50%) translate(${cropState.offset.x}px, ${cropState.offset.y}px) scale(${clampedScale})`,
                      transformOrigin: "center center"
                    }}
                    onLoad={handleCropImageLoad}
                    draggable={false}
                  />
                </div>
                <p className="text-xs text-slate-500">
                  ?寞?撠箏站?箏? 85.7mm x 54mm嚗??澈??摰憛急遛獢???                </p>
              </div>
              <div className="space-y-4 rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span>蝮格</span>
                    <span>{clampedScale.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min={minScale}
                    max={maxScale}
                    step={0.01}
                    value={clampedScale}
                    onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
                    className="w-full accent-emerald-600"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeCropper}
                    className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
                  >
                    ??
                  </button>
                  <button
                    type="button"
                    onClick={confirmCrop}
                    className="rounded bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-500"
                  >
                    蝣箄?
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function FileUploadField({
  label,
  helper,
  file,
  onChange,
  boxStyle,
  spanCols = false,
  sizeHint,
  previewUrl,
  previewFit = "cover"
}: {
  label: string;
  helper?: string;
  file: File | null;
  onChange: (file: File | null) => void;
  boxStyle?: CSSProperties;
  spanCols?: boolean;
  sizeHint?: string;
  previewUrl?: string | null;
  previewFit?: "cover" | "contain";
}) {
  const inputId = useId();
  const hasPreview = Boolean(previewUrl);

  return (
    <div className={`space-y-2 ${spanCols ? "md:col-span-2" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="space-y-0.5">
          <p className="text-sm font-medium text-slate-800">{label}</p>
          {helper && <p className="text-xs text-slate-500">{helper}</p>}
        </div>
        <span className="truncate text-xs text-slate-500">
          {file ? `撌脤??${file.name}` : "撠?豢?瑼?"}
        </span>
      </div>
      <label
        htmlFor={inputId}
        className={`flex w-full cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed border-slate-300 bg-white/60 text-sm text-slate-600 transition hover:border-emerald-500 hover:text-emerald-700 ${
          hasPreview ? "p-0" : "px-3 py-4"
        }`}
        style={boxStyle}
      >
        {hasPreview ? (
          <img
            src={previewUrl ?? undefined}
            alt={label}
            className="h-full w-full rounded-md object-cover"
            style={{ objectFit: previewFit }}
            draggable={false}
          />
        ) : (
          <div className="space-y-1 text-center">
            <div className="text-sm font-semibold">暺?銝</div>
            <div className="text-xs text-slate-500">
              {sizeHint ? sizeHint + " | JPG/PNG only" : "Supported: JPG, PNG"}
            </div>
          </div>
        )}
      </label>
      <input
        id={inputId}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}

async function fetchOwner(id: string): Promise<{ owner: OwnerDetail | null; error: string | null }> {
  try {
    const { data } = await apiFetch<OwnerDetail>(`/api/owners/${id}`);
    return { owner: data, error: null };
  } catch (err) {
    const status = (err as { status?: number }).status;
    const details = (err as { details?: unknown }).details;
    const detailText = typeof details === "string" ? details : details ? JSON.stringify(details) : String(err);
    return { owner: null, error: "Failed to load owner (" + (status ?? "?") + "): " + detailText };
  }
}

