/** Icons: Phosphor (regular weight; fill for status icons), behind one small name-based API. */

import {
  ArrowCircleDown, ArrowLeft, ArrowRight, ArrowSquareOut, ArrowsClockwise, BookmarkSimple, CaretDown, CaretRight, ChartBar, CheckCircle,
  ClockCounterClockwise, Columns, Command, Compass, Copy, DeviceMobile, DotsThree, DownloadSimple, Eye, EyeSlash, FileText, Fire, FolderOpen,
  GearSix, House, Info, Kanban, Key, Lightning, Link, MagicWand, MagnifyingGlass, Moon, Play, Plus, RedditLogo, RocketLaunch, SlidersHorizontal,
  List, Star, Sun, Target, Trash, TrendUp, User, Warning, WarningCircle, X, XCircle,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";

const ICONS = {
  home: House, search: MagnifyingGlass, compass: Compass, rocket: RocketLaunch, flame: Fire, board: Kanban, clock: ClockCounterClockwise,
  gear: GearSix, check: CheckCircle, x: XCircle, info: Info, warn: WarningCircle, alert: Warning, close: X, plus: Plus, bookmark: BookmarkSimple,
  download: DownloadSimple, external: ArrowSquareOut, trash: Trash, sun: Sun, moon: Moon, user: User, bolt: Lightning, play: Play,
  phone: DeviceMobile, reddit: RedditLogo, refresh: ArrowsClockwise, key: Key, target: Target, chart: ChartBar, wand: MagicWand, copy: Copy,
  link: Link, folder: FolderOpen, eye: Eye, eyeOff: EyeSlash, file: FileText, columns: Columns, trend: TrendUp, command: Command,
  arrowRight: ArrowRight, arrowLeft: ArrowLeft, chevronDown: CaretDown, chevronRight: CaretRight, more: DotsThree, update: ArrowCircleDown,
  sliders: SlidersHorizontal, star: Star, menu: List,
} satisfies Record<string, PhosphorIcon>;

export type IconName = keyof typeof ICONS;

/** Status icons (check, x, warn, alert) use Phosphor's fill weight; everything else is regular. */
const FILLED = new Set<IconName>(["check", "x", "warn", "alert"]);

export function Icon({ name, size = 16, className, fill }: { name: IconName; size?: number; className?: string; fill?: boolean }) {
  const C = ICONS[name];
  return <C size={size} weight={fill ?? FILLED.has(name) ? "fill" : "regular"} className={className ? `ico ${className}` : "ico"} aria-hidden="true" />;
}
