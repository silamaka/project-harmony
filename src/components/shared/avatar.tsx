import { Camera } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Avatar circulaire : photo si disponible, sinon initiales. */
export function UserAvatar({
  user,
  className,
}: {
  user: { first_name: string; last_name: string; avatar_url?: string | undefined };
  className?: string;
}) {
  if (user.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt={`${user.first_name} ${user.last_name}`}
        className={cn("shrink-0 rounded-full object-cover", className)}
      />
    );
  }
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground",
        className,
      )}
    >
      {user.first_name[0]}
      {user.last_name[0]}
    </div>
  );
}

/** Redimensionne l'image côté client (max 256px, JPEG) avant stockage en data URL. */
function resizeImageToDataUrl(file: File, maxSize = 256, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Lecture impossible"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Image invalide"));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas indisponible"));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/** Sélecteur de photo de profil (upload local, sans backend). */
export function AvatarPicker({
  value,
  onChange,
  fallbackInitials,
}: {
  value: string;
  onChange: (dataUrl: string) => void;
  fallbackInitials: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Veuillez sélectionner une image.");
      return;
    }
    setLoading(true);
    try {
      onChange(await resizeImageToDataUrl(file));
    } catch {
      toast.error("Image invalide.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="group relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-dashed border-input bg-muted"
        aria-label="Choisir une photo de profil"
      >
        {value ? (
          <img src={value} alt="Aperçu" className="h-full w-full object-cover" />
        ) : (
          <span className="text-sm font-bold text-muted-foreground">{fallbackInitials}</span>
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-foreground/40 opacity-0 transition-opacity group-hover:opacity-100">
          <Camera className="h-4 w-4 text-white" />
        </span>
      </button>
      <div className="flex flex-col items-start gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={loading}
        >
          {loading ? "Chargement..." : value ? "Changer la photo" : "Choisir une photo"}
        </Button>
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-xs text-muted-foreground hover:text-destructive"
          >
            Retirer la photo
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
