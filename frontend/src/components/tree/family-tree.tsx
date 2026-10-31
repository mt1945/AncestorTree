/**
 * @project AncestorTree
 * @file src/components/tree/family-tree.tsx
 * @description Interactive family tree with zoom, pan, collapse/expand, filters, minimap
 * @version 2.0.0 - Sprint 3 Enhanced
 * @updated 2026-02-24
 */

'use client';

import { useMemo, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTreeData, familyKeys } from '@/hooks/use-families';
import { useAuth } from '@/components/auth/auth-provider';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  User,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Move,
  Maximize2,
  Users,
  ArrowUpFromLine,
  ArrowDownFromLine,
  Search,
  X,
  GitBranch,
  Undo2,
} from 'lucide-react';
import type { Person } from '@/types';
import type { TreeData } from '@/lib/supabase-data';
import { updateChildrenOrder } from '@/lib/supabase-data';
import Link from 'next/link';

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

const NODE_WIDTH = 120;
const NODE_HEIGHT = 96;
const TOP_OVERFLOW = 10; // extra space above node for the in-law badge
const BUTTON_OVERFLOW = 16; // extra space below node so collapse button is not clipped
const LEVEL_HEIGHT = 140;
const SIBLING_GAP = 20;
const MINIMAP_WIDTH = 160;
const MINIMAP_HEIGHT = 100;
const OFFSETS_STORAGE_KEY = 'ancestortree:node-offsets:v1';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

type ViewMode = 'all' | 'ancestors' | 'descendants';

// Manual position adjustments made by the user (drag & drop), keyed by person id
type NodeOffsets = Record<string, { dx: number; dy: number }>;

// Position of a person among siblings of the same parents (left = eldest)
interface SiblingNav {
  familyId: string;
  index: number;
  orderedIds: string[];
}

interface TreeNodeData {
  person: Person;
  x: number;
  y: number;
  isCollapsed: boolean;
  hasChildren: boolean;
  isVisible: boolean;
  // Link to the spouse's family line (in-laws): 'Nhà ngoại' / 'Nhà chồng'
  externalLink?: { personId: string; label: string };
  siblingNav?: SiblingNav;
}

interface TreeConnectionData {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  type: 'parent-child' | 'couple';
  isVisible: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// Tree Node Component
// ═══════════════════════════════════════════════════════════════════════════

interface TreeNodeProps {
  node: TreeNodeData;
  onSelect: (person: Person) => void;
  onToggleCollapse: (personId: string) => void;
  isSelected: boolean;
  editMode: boolean;
  onDragStart: (personId: string, clientX: number, clientY: number) => void;
  onOpenExternal: (personId: string) => void;
  canArrange: boolean;
  onMoveSibling: (nav: SiblingNav, dir: -1 | 1) => void;
}

function TreeNode({ node, onSelect, onToggleCollapse, isSelected, editMode, onDragStart, onOpenExternal, canArrange, onMoveSibling }: TreeNodeProps) {
  const { person, x, y, isCollapsed, hasChildren, externalLink, siblingNav } = node;
  
  const initials = person.display_name
    .split(' ')
    .map((n) => n[0])
    .slice(-2)
    .join('')
    .toUpperCase();

  const genderColor = person.gender === 1 ? 'border-blue-400' : 'border-pink-400';
  const selectedRing = isSelected ? 'ring-2 ring-primary ring-offset-2' : '';

  return (
    <motion.g
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ duration: 0.3 }}
    >
      <foreignObject
        x={x}
        y={y - TOP_OVERFLOW}
        width={NODE_WIDTH}
        height={NODE_HEIGHT + BUTTON_OVERFLOW + TOP_OVERFLOW}
        style={{ overflow: 'visible' }}
      >
        <div
          style={{ height: NODE_HEIGHT, marginTop: TOP_OVERFLOW }}
          className={`bg-card border-2 ${genderColor} ${selectedRing} rounded-lg shadow-sm ${editMode ? 'cursor-move' : 'cursor-pointer'} hover:shadow-md transition-shadow px-2 py-1.5 flex flex-col items-center justify-center relative`}
          onClick={() => onSelect(person)}
          onMouseDown={(e) => {
            if (!editMode || e.button !== 0) return;
            e.stopPropagation(); // don't pan the canvas while dragging a node
            onDragStart(person.id, e.clientX, e.clientY);
          }}
          onTouchStart={(e) => {
            if (!editMode || e.touches.length !== 1) return;
            e.stopPropagation();
            onDragStart(person.id, e.touches[0].clientX, e.touches[0].clientY);
          }}
        >
          <Avatar className="h-8 w-8 mb-1 shrink-0">
            <AvatarImage src={person.avatar_url} />
            <AvatarFallback className="text-xs">
              {initials || <User className="h-3 w-3" />}
            </AvatarFallback>
          </Avatar>
          <span className="text-xs font-medium text-center line-clamp-2 leading-tight">
            {person.display_name}
            {!person.is_living && <span className="text-muted-foreground"> †</span>}
          </span>

          {/* Reorder among siblings (saved to database): left = eldest */}
          {editMode && canArrange && siblingNav && (
            <>
              <button
                disabled={siblingNav.index === 0}
                className="absolute left-0.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded border bg-background flex items-center justify-center hover:bg-muted disabled:opacity-30 disabled:pointer-events-none z-10"
                title="Dời sang trái (lớn hơn)"
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onMoveSibling(siblingNav, -1); }}
              >
                <ChevronLeft className="h-3 w-3" />
              </button>
              <button
                disabled={siblingNav.index === siblingNav.orderedIds.length - 1}
                className="absolute right-0.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded border bg-background flex items-center justify-center hover:bg-muted disabled:opacity-30 disabled:pointer-events-none z-10"
                title="Dời sang phải (nhỏ hơn)"
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onMoveSibling(siblingNav, 1); }}
              >
                <ChevronRight className="h-3 w-3" />
              </button>
            </>
          )}

          {/* In-law badge: jump to the spouse's family line */}
          {externalLink && (
            <button
              className="absolute -top-2.5 right-2 text-[10px] leading-none px-1.5 py-1 rounded-full border bg-background text-muted-foreground hover:text-foreground hover:bg-muted shadow-sm z-10"
              title={`${externalLink.label} của ${person.display_name}`}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onOpenExternal(externalLink.personId);
              }}
            >
              {externalLink.label} ›
            </button>
          )}

          {/* Collapse/Expand button */}
          {hasChildren && (
            <button
              className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 bg-background border rounded-full flex items-center justify-center shadow-sm hover:bg-muted transition-colors z-10"
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onToggleCollapse(person.id);
              }}
            >
              {isCollapsed ? (
                <ChevronRight className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </button>
          )}
        </div>
      </foreignObject>
    </motion.g>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Tree Connection Component
// ═══════════════════════════════════════════════════════════════════════════

interface TreeConnectionProps {
  connection: TreeConnectionData;
}

function TreeConnection({ connection }: TreeConnectionProps) {
  const { x1, y1, x2, y2, type } = connection;

  if (type === 'couple') {
    return (
      <motion.line
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.5 }}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="currentColor"
        strokeWidth={2}
        className="text-pink-400"
      />
    );
  }

  // Parent-child: draw stepped line
  const midY = y1 + (y2 - y1) / 2;
  return (
    <motion.path
      initial={{ pathLength: 0 }}
      animate={{ pathLength: 1 }}
      transition={{ duration: 0.5 }}
      d={`M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className="text-muted-foreground"
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Minimap Component
// ═══════════════════════════════════════════════════════════════════════════

interface MinimapProps {
  nodes: TreeNodeData[];
  viewBox: { x: number; y: number; width: number; height: number };
  treeWidth: number;
  treeHeight: number;
  onViewportClick: (x: number, y: number) => void;
}

function Minimap({ nodes, viewBox, treeWidth, treeHeight, onViewportClick }: MinimapProps) {
  const scaleX = MINIMAP_WIDTH / treeWidth;
  const scaleY = MINIMAP_HEIGHT / treeHeight;
  const scale = Math.min(scaleX, scaleY) * 0.9;

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;
    onViewportClick(x, y);
  };

  const visibleNodes = nodes.filter(n => n.isVisible);

  return (
    <div className="absolute bottom-4 right-4 bg-background/90 border rounded-lg p-2 shadow-lg">
      <svg
        width={MINIMAP_WIDTH}
        height={MINIMAP_HEIGHT}
        className="cursor-pointer"
        onClick={handleClick}
      >
        <g transform={`scale(${scale})`}>
          {/* Nodes as dots */}
          {visibleNodes.map((node) => (
            <circle
              key={node.person.id}
              cx={node.x + NODE_WIDTH / 2}
              cy={node.y + NODE_HEIGHT / 2}
              r={4 / scale}
              className={node.person.gender === 1 ? 'fill-blue-400' : 'fill-pink-400'}
            />
          ))}
          
          {/* Viewport rectangle */}
          <rect
            x={viewBox.x}
            y={viewBox.y}
            width={viewBox.width}
            height={viewBox.height}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth={2 / scale}
            className="opacity-50"
          />
        </g>
      </svg>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Tree Layout Builder — Hierarchical (Bottom-up subtree sizing)
// ═══════════════════════════════════════════════════════════════════════════

const COUPLE_GAP = 16;

function buildTreeLayout(
  data: TreeData,
  collapsedNodes: Set<string>,
  viewMode: ViewMode,
  focusPersonId: string | null,
  filterRootId: string | null = null,
  offsets: NodeOffsets = {}
) {
  const { people, families, children } = data;

  // Build relationship maps
  const fatherToFamilies = new Map<string, typeof families>();
  const motherToFamilies = new Map<string, typeof families>();
  const childToFamily = new Map<string, (typeof families)[0]>();

  for (const family of families) {
    if (family.father_id) {
      if (!fatherToFamilies.has(family.father_id)) fatherToFamilies.set(family.father_id, []);
      fatherToFamilies.get(family.father_id)!.push(family);
    }
    if (family.mother_id) {
      if (!motherToFamilies.has(family.mother_id)) motherToFamilies.set(family.mother_id, []);
      motherToFamilies.get(family.mother_id)!.push(family);
    }
  }
  for (const child of children) {
    if (!childToFamily.has(child.person_id)) {
      const fam = families.find((f) => f.id === child.family_id);
      if (fam) childToFamily.set(child.person_id, fam);
    }
  }

  // A man's marriages in chronological order (first wife is placed closest to him)
  const byMarriage = (a: (typeof families)[0], b: (typeof families)[0]) => {
    if (a.marriage_date && b.marriage_date) {
      const d = Date.parse(a.marriage_date) - Date.parse(b.marriage_date);
      if (!isNaN(d) && d !== 0) return d;
    }
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  };
  fatherToFamilies.forEach((list) => list.sort(byMarriage));

  const personById = new Map(people.map((p) => [p.id, p]));

  // Birth timestamp for ordering siblings (null = unknown)
  const birthKey = (id: string): number | null => {
    const p = personById.get(id);
    if (!p) return null;
    if (p.birth_date) {
      const t = Date.parse(p.birth_date);
      if (!isNaN(t)) return t;
    }
    if (p.birth_year) return Date.UTC(p.birth_year, 0, 1);
    return null;
  };

  // Sibling order (left = eldest): saved sort_order wins; birth date breaks ties
  const compareSiblings = (
    a: { person_id: string; sort_order: number },
    b: { person_id: string; sort_order: number }
  ) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    const ka = birthKey(a.person_id);
    const kb = birthKey(b.person_id);
    if (ka !== null && kb !== null && ka !== kb) return ka - kb;
    return 0;
  };

  // Family surname = the surname most men carry (e.g. "Đinh"); other lines are in-laws
  const surnameOf = (p: Person) => (p.surname || p.display_name.split(' ')[0] || '').trim();
  const mainSurname = (() => {
    const counts = new Map<string, number>();
    for (const p of people) {
      if (p.gender !== 1) continue;
      const sn = surnameOf(p);
      if (sn) counts.set(sn, (counts.get(sn) || 0) + 1);
    }
    let best = '';
    let bestN = 0;
    counts.forEach((n, sn) => { if (n > bestN) { best = sn; bestN = n; } });
    return best;
  })();

  // Visible people selection
  const getVisiblePeopleIds = (): Set<string> => {
    const visible = new Set<string>();

    // Patriline traversal: person + wives + descendants through FATHERS only.
    // A daughter is shown as a leaf; her husband and children belong to the husband's line.
    const addPatriline = (personId: string, isStart: boolean) => {
      if (visible.has(personId)) return;
      visible.add(personId);
      const fams = [
        ...(fatherToFamilies.get(personId) || []),
        ...(isStart ? motherToFamilies.get(personId) || [] : []),
      ];
      for (const fam of fams) {
        if (fam.father_id) visible.add(fam.father_id);
        if (fam.mother_id) visible.add(fam.mother_id);
      }
      if (collapsedNodes.has(personId)) return;
      for (const fam of fams) {
        children
          .filter((c) => c.family_id === fam.id)
          .forEach((c) => addPatriline(c.person_id, false));
      }
    };

    if (filterRootId) {
      addPatriline(filterRootId, true);
      return visible;
    }

    if (viewMode === 'all') {
      // Main branch only: heads of lines carrying the main surname (in-law lines are reached via the badge)
      for (const p of people) {
        if (childToFamily.get(p.id)?.father_id) continue; // not a head of line
        if (mainSurname && surnameOf(p) && surnameOf(p) !== mainSurname) continue;
        addPatriline(p.id, true);
      }
    } else if (viewMode === 'ancestors' && focusPersonId) {
      const addAncestors = (personId: string) => {
        visible.add(personId);
        const fam = childToFamily.get(personId);
        if (fam?.father_id) addAncestors(fam.father_id);
        if (fam?.mother_id) addAncestors(fam.mother_id);
      };
      addAncestors(focusPersonId);
    } else if (viewMode === 'descendants' && focusPersonId) {
      const addDescendants = (personId: string) => {
        if (visible.has(personId)) return;
        visible.add(personId);
        const fams = [
          ...(fatherToFamilies.get(personId) || []),
          ...(motherToFamilies.get(personId) || []),
        ];
        for (const fam of fams) {
          if (fam.father_id && fam.father_id !== personId) visible.add(fam.father_id);
          if (fam.mother_id && fam.mother_id !== personId) visible.add(fam.mother_id);
          children.filter((c) => c.family_id === fam.id).forEach((c) => addDescendants(c.person_id));
        }
      };
      addDescendants(focusPersonId);
    } else {
      people.forEach((p) => visible.add(p.id));
    }

    return visible;
  };

  const visibleIds = getVisiblePeopleIds();
  const visiblePeople = people.filter((p) => visibleIds.has(p.id));

  if (visiblePeople.length === 0) {
    return { nodes: [], connections: [], width: 0, height: 0, offsetX: 0 };
  }

  // Wives will be positioned adjacent to husband — mark them
  const positionedAsWife = new Set<string>();
  for (const p of visiblePeople) {
    if (p.gender === 2) {
      const fams = motherToFamilies.get(p.id) || [];
      if (fams.some((f) => f.father_id && visibleIds.has(f.father_id))) {
        positionedAsWife.add(p.id);
      }
    }
  }

  // Helpers
  const getVisibleChildrenAsFather = (personId: string): string[] => {
    const fams = fatherToFamilies.get(personId) || [];
    const result: string[] = [];
    for (const fam of fams) {
      children
        .filter(
          (c) =>
            c.family_id === fam.id &&
            visibleIds.has(c.person_id) &&
            // a person shown as someone's wife is placed next to her husband, not as a child
            !positionedAsWife.has(c.person_id)
        )
        .sort(compareSiblings)
        .forEach((c) => { if (!result.includes(c.person_id)) result.push(c.person_id); });
    }
    return result;
  };

  // All children regardless of collapse state (so the toggle button stays after collapsing)
  const hasAnyChildren = (personId: string): boolean => {
    const fams = fatherToFamilies.get(personId) || [];
    return fams.some((fam) =>
      children.some((c) => c.family_id === fam.id && !positionedAsWife.has(c.person_id))
    );
  };

  // All visible wives of a man (supports multiple marriages), in family order
  const getVisibleWives = (personId: string): string[] => {
    const fams = fatherToFamilies.get(personId) || [];
    const result: string[] = [];
    for (const fam of fams) {
      if (fam.mother_id && visibleIds.has(fam.mother_id) && !result.includes(fam.mother_id)) {
        result.push(fam.mother_id);
      }
    }
    return result;
  };

  // Root nodes: not a wife, and no visible father
  const roots: string[] = [];
  for (const p of visiblePeople) {
    if (positionedAsWife.has(p.id)) continue;
    const parentFam = childToFamily.get(p.id);
    if (!parentFam?.father_id || !visibleIds.has(parentFam.father_id)) {
      roots.push(p.id);
    }
  }

  roots.sort((a, b) => (birthKey(a) ?? Infinity) - (birthKey(b) ?? Infinity));

  // Bottom-up: subtree widths
  const subtreeWidths = new Map<string, number>();
  const computeSubtreeWidth = (personId: string): number => {
    if (subtreeWidths.has(personId)) return subtreeWidths.get(personId)!;
    const wives = getVisibleWives(personId);
    const visChildren = collapsedNodes.has(personId) ? [] : getVisibleChildrenAsFather(personId);
    const coupleWidth = NODE_WIDTH + wives.length * (COUPLE_GAP + NODE_WIDTH);
    const childrenWidth = visChildren.length > 0
      ? visChildren.reduce((s, c) => s + computeSubtreeWidth(c), 0) + (visChildren.length - 1) * SIBLING_GAP
      : 0;
    const result = Math.max(coupleWidth, childrenWidth);
    subtreeWidths.set(personId, result);
    return result;
  };
  for (const root of roots) computeSubtreeWidth(root);

  // Top-down: assign X positions
  const xPositions = new Map<string, number>();
  const wifeOf = new Map<string, string>(); // wifeId -> husbandId (keeps wives on the husband's row)
  const assignPositions = (personId: string, startX: number) => {
    const sw = subtreeWidths.get(personId) || NODE_WIDTH;
    const wives = getVisibleWives(personId);
    const visChildren = collapsedNodes.has(personId) ? [] : getVisibleChildrenAsFather(personId);
    const coupleWidth = NODE_WIDTH + wives.length * (COUPLE_GAP + NODE_WIDTH);
    const centerX = startX + sw / 2;

    // Center couple unit
    const fatherX = centerX - coupleWidth / 2;
    xPositions.set(personId, fatherX);
    // Wives sit right next to the husband, in order
    wives.forEach((w, i) => {
      if (!xPositions.has(w)) {
        xPositions.set(w, fatherX + (i + 1) * (NODE_WIDTH + COUPLE_GAP));
        wifeOf.set(w, personId);
      }
    });

    // Children spread centered under couple
    if (visChildren.length > 0) {
      const totalChildW = visChildren.reduce((s, c) => s + (subtreeWidths.get(c) || NODE_WIDTH), 0)
        + (visChildren.length - 1) * SIBLING_GAP;
      let childX = centerX - totalChildW / 2;
      for (const child of visChildren) {
        assignPositions(child, childX);
        childX += (subtreeWidths.get(child) || NODE_WIDTH) + SIBLING_GAP;
      }
    }
  };

  let rootStartX = 0;
  for (const root of roots) {
    assignPositions(root, rootStartX);
    rootStartX += (subtreeWidths.get(root) || NODE_WIDTH) + SIBLING_GAP * 2;
  }

  const effGen = (person: Person): number => {
    const husband = wifeOf.get(person.id);
    return (husband ? personById.get(husband)?.generation : undefined) ?? person.generation ?? 1;
  };
  const placedPeople = visiblePeople.filter((p) => xPositions.has(p.id));
  const minGen = placedPeople.length ? Math.min(...placedPeople.map(effGen)) : 1;
  const nodes: TreeNodeData[] = [];
  for (const person of visiblePeople) {
    if (!xPositions.has(person.id)) continue;
    nodes.push({
      person,
      x: xPositions.get(person.id)!,
      y: (effGen(person) - minGen) * LEVEL_HEIGHT + 20,
      isCollapsed: collapsedNodes.has(person.id),
      hasChildren:
        getVisibleChildrenAsFather(person.id).length > 0 ||
        (collapsedNodes.has(person.id) && hasAnyChildren(person.id)),
      isVisible: true,
    });
  }

  // Sibling navigation (◀ ▶ buttons in arrange mode)
  const nodeById = new Map(nodes.map((n) => [n.person.id, n]));
  for (const fam of families) {
    const ordered = children
      .filter(
        (c) => c.family_id === fam.id && !positionedAsWife.has(c.person_id) && nodeById.has(c.person_id)
      )
      .sort(compareSiblings)
      .map((c) => c.person_id);
    if (ordered.length < 2) continue;
    ordered.forEach((id, index) => {
      nodeById.get(id)!.siblingNav = { familyId: fam.id, index, orderedIds: ordered };
    });
  }

  // In-law badges: wives -> her parents' line ("Nhà ngoại"); married daughters -> husband's line ("Nhà chồng")
  const topOfLine = (personId: string): string => {
    let cur = personId;
    const seen = new Set<string>();
    while (!seen.has(cur)) {
      seen.add(cur);
      const f = childToFamily.get(cur)?.father_id;
      if (!f) break;
      cur = f;
    }
    return cur;
  };
  for (const n of nodes) {
    const p = n.person;
    if (positionedAsWife.has(p.id)) {
      const pf = childToFamily.get(p.id);
      const parentId = pf?.father_id ?? pf?.mother_id;
      if (parentId && !visibleIds.has(parentId)) {
        n.externalLink = { personId: topOfLine(parentId), label: 'Nhà ngoại' };
      }
    } else if (p.gender === 2) {
      const fam = (motherToFamilies.get(p.id) || []).find(
        (f) => f.father_id && !visibleIds.has(f.father_id)
      );
      if (fam?.father_id) n.externalLink = { personId: topOfLine(fam.father_id), label: 'Nhà chồng' };
    }
  }

  // Origin stays stable while dragging: computed from positions BEFORE manual offsets
  let baseMinX = Infinity;
  for (const n of nodes) baseMinX = Math.min(baseMinX, n.x);
  if (!isFinite(baseMinX)) baseMinX = 0;

  // Apply manual offsets (drag & drop)
  for (const n of nodes) {
    const o = offsets[n.person.id];
    if (o) {
      n.x += o.dx;
      n.y += o.dy;
    }
  }

  // Build connections
  const connections: TreeConnectionData[] = [];
  const personPos = new Map(nodes.map((n) => [n.person.id, { x: n.x, y: n.y }]));

  for (const family of families) {
    const fatherPos = family.father_id ? personPos.get(family.father_id) : null;
    const motherPos = family.mother_id ? personPos.get(family.mother_id) : null;
    if (!fatherPos && !motherPos) continue;

    // Couple line: connect the nearest edges (works wherever the boxes are dragged to)
    if (fatherPos && motherPos) {
      const W = NODE_WIDTH;
      const H = NODE_HEIGHT;
      let x1: number, y1: number, x2: number, y2: number;
      if (motherPos.x >= fatherPos.x + W) {
        x1 = fatherPos.x + W; y1 = fatherPos.y + H / 2;
        x2 = motherPos.x;     y2 = motherPos.y + H / 2;
      } else if (fatherPos.x >= motherPos.x + W) {
        x1 = fatherPos.x;     y1 = fatherPos.y + H / 2;
        x2 = motherPos.x + W; y2 = motherPos.y + H / 2;
      } else {
        const fatherAbove = fatherPos.y <= motherPos.y;
        x1 = fatherPos.x + W / 2; x2 = motherPos.x + W / 2;
        y1 = fatherPos.y + (fatherAbove ? H : 0);
        y2 = motherPos.y + (fatherAbove ? 0 : H);
      }
      connections.push({
        id: `couple-${family.id}`,
        x1, y1, x2, y2,
        type: 'couple',
        isVisible: true,
      });
    }

    const parentIsCollapsed =
      (family.father_id && collapsedNodes.has(family.father_id)) ||
      (!family.father_id && family.mother_id && collapsedNodes.has(family.mother_id));
    if (parentIsCollapsed) continue;

    const familyCenterX =
      fatherPos && motherPos
        ? (fatherPos.x + motherPos.x) / 2 + NODE_WIDTH / 2
        : (fatherPos ?? motherPos)!.x + NODE_WIDTH / 2;
    const familyBottomY =
      Math.max(fatherPos?.y ?? -Infinity, motherPos?.y ?? -Infinity) + NODE_HEIGHT;

    children.filter((c) => c.family_id === family.id).forEach((child) => {
      // people shown as a wife are attached to their husband, not drawn as a child
      if (positionedAsWife.has(child.person_id)) return;
      const childPos = personPos.get(child.person_id);
      if (childPos) {
        connections.push({
          id: `child-${family.id}-${child.person_id}`,
          x1: familyCenterX,
          y1: familyBottomY,
          x2: childPos.x + NODE_WIDTH / 2,
          y2: childPos.y,
          type: 'parent-child',
          isVisible: true,
        });
      }
    });
  }

  // Bounds
  let minX = Infinity, maxX = -Infinity, maxY = 0;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    maxX = Math.max(maxX, n.x + NODE_WIDTH);
    maxY = Math.max(maxY, n.y + NODE_HEIGHT);
  }
  if (!isFinite(minX)) { minX = 0; maxX = 0; }

  return {
    nodes,
    connections,
    width: maxX - minX + 100,
    height: maxY + 50,
    offsetX: -baseMinX + 50,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers for manual layout (drag & drop)
// ═══════════════════════════════════════════════════════════════════════════

/** A person + (if male) all wives + all descendants (and their wives) */
function getBranchIds(personId: string, data: TreeData): string[] {
  const ids = new Set<string>();
  const visit = (id: string) => {
    if (ids.has(id)) return;
    ids.add(id);
    for (const fam of data.families) {
      if (fam.father_id !== id) continue;
      if (fam.mother_id) ids.add(fam.mother_id);
      data.children
        .filter((c) => c.family_id === fam.id)
        .forEach((c) => visit(c.person_id));
    }
  };
  visit(personId);
  return [...ids];
}

function loadOffsets(): NodeOffsets {
  try {
    const raw = localStorage.getItem(OFFSETS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as NodeOffsets) : {};
  } catch {
    return {};
  }
}

function saveOffsets(offsets: NodeOffsets) {
  try {
    if (Object.keys(offsets).length === 0) localStorage.removeItem(OFFSETS_STORAGE_KEY);
    else localStorage.setItem(OFFSETS_STORAGE_KEY, JSON.stringify(offsets));
  } catch {
    /* storage unavailable — layout just won't persist */
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Family Tree Component
// ═══════════════════════════════════════════════════════════════════════════

export function FamilyTree() {
  const { data, isLoading, error } = useTreeData();

  // State
  const [scale, setScale] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 0.7 : 1
  );
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [showMinimap, setShowMinimap] = useState(true);
  // Lazy init from ?root= URL param (component is ssr:false so window is always available here)
  const [filterRootId, setFilterRootId] = useState<string | null>(() =>
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('root')
      : null
  );
  // Manual arrangement (drag & drop)
  const [editMode, setEditMode] = useState(false);
  const [moveBranch, setMoveBranch] = useState(true);
  const [offsets, setOffsets] = useState<NodeOffsets>(() =>
    typeof window !== 'undefined' ? loadOffsets() : {}
  );
  const justDraggedRef = useRef(false);
  const [filterSearch, setFilterSearch] = useState('');
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);

  const handleSetFilterRoot = useCallback((person: Person | null) => {
    setFilterRootId(person?.id ?? null);
    setFilterSearch('');
    setFilterDropdownOpen(false);
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (person) params.set('root', person.id);
      else params.delete('root');
      window.history.replaceState(null, '', params.toString() ? `?${params.toString()}` : window.location.pathname);
    }
  }, []);

  const filterRootPerson = filterRootId
    ? data?.people.find((p) => p.id === filterRootId) ?? null
    : null;

  // Jump to the spouse's family line (in-law tree)
  const handleOpenExternal = useCallback(
    (personId: string) => {
      const target = data?.people.find((p) => p.id === personId);
      if (!target) return;
      setCollapsedNodes(new Set());
      setSelectedPerson(null);
      setScale(1);
      setPan({ x: 0, y: 0 });
      handleSetFilterRoot(target);
    },
    [data, handleSetFilterRoot]
  );

  // Reorder siblings (admin/editor only; saved in database for everyone)
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const canArrange = profile?.role === 'admin' || profile?.role === 'editor';
  const handleMoveSibling = useCallback(
    async (nav: SiblingNav, dir: -1 | 1) => {
      const to = nav.index + dir;
      if (to < 0 || to >= nav.orderedIds.length) return;
      const next = [...nav.orderedIds];
      [next[nav.index], next[to]] = [next[to], next[nav.index]];
      try {
        await updateChildrenOrder(nav.familyId, next);
        await queryClient.invalidateQueries({ queryKey: familyKeys.tree() });
      } catch (e) {
        toast.error('Không lưu được thứ tự: ' + (e instanceof Error ? e.message : 'lỗi không xác định'));
      }
    },
    [queryClient]
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });

  // Track container size via ResizeObserver (avoids reading refs during render)
  const containerCallbackRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      containerRef.current = node;
      setContainerSize({ width: node.clientWidth, height: node.clientHeight });
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height });
        }
      });
      observer.observe(node);
      return () => observer.disconnect();
    }
  }, []);

  // Layout
  const layout = useMemo(() => {
    if (!data || data.people.length === 0) return null;
    return buildTreeLayout(data, collapsedNodes, viewMode, selectedPerson?.id || null, filterRootId, offsets);
  }, [data, collapsedNodes, viewMode, selectedPerson?.id, filterRootId, offsets]);

  // Handlers
  const handleZoomIn = () => setScale((s) => Math.min(s + 0.1, 2));
  const handleZoomOut = () => setScale((s) => Math.max(s - 0.1, 0.3));
  const handleReset = () => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  };

  const handleToggleCollapse = useCallback((personId: string) => {
    setCollapsedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(personId)) {
        next.delete(personId);
      } else {
        next.add(personId);
      }
      return next;
    });
  }, []);

  // Ignore the click that ends a drag, so dragging doesn't also select the person
  const handleSelectNode = useCallback((person: Person) => {
    if (justDraggedRef.current) return;
    setSelectedPerson(person);
  }, []);

  // Drag & drop a node (and optionally its whole branch)
  const handleNodeDragStart = useCallback(
    (personId: string, startClientX: number, startClientY: number) => {
      if (!editMode || !data) return;
      const ids = moveBranch ? getBranchIds(personId, data) : [personId];
      const base = offsets;
      const startScale = scale;
      let moved = false;
      let latest = base;

      const move = (clientX: number, clientY: number) => {
        if (!moved && Math.hypot(clientX - startClientX, clientY - startClientY) < 4) return;
        moved = true;
        justDraggedRef.current = true;
        const ddx = (clientX - startClientX) / startScale;
        const ddy = (clientY - startClientY) / startScale;
        const next: NodeOffsets = { ...base };
        for (const id of ids) {
          const o = base[id] ?? { dx: 0, dy: 0 };
          next[id] = { dx: o.dx + ddx, dy: o.dy + ddy };
        }
        latest = next;
        setOffsets(next);
      };

      const onMouseMove = (e: MouseEvent) => move(e.clientX, e.clientY);
      const onTouchMove = (e: TouchEvent) => {
        if (e.touches.length !== 1) return;
        e.preventDefault();
        move(e.touches[0].clientX, e.touches[0].clientY);
      };
      const end = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', end);
        window.removeEventListener('touchmove', onTouchMove);
        window.removeEventListener('touchend', end);
        window.removeEventListener('touchcancel', end);
        if (moved) {
          saveOffsets(latest);
          setTimeout(() => { justDraggedRef.current = false; }, 0);
        }
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', end);
      window.addEventListener('touchmove', onTouchMove, { passive: false });
      window.addEventListener('touchend', end);
      window.addEventListener('touchcancel', end);
    },
    [editMode, data, moveBranch, offsets, scale]
  );

  const handleResetLayout = () => {
    setOffsets({});
    saveOffsets({});
  };

  // Pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  // Touch handlers for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsPanning(true);
      setPanStart({
        x: e.touches[0].clientX - pan.x,
        y: e.touches[0].clientY - pan.y,
      });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isPanning && e.touches.length === 1) {
      setPan({
        x: e.touches[0].clientX - panStart.x,
        y: e.touches[0].clientY - panStart.y,
      });
    }
  };

  const handleTouchEnd = () => {
    setIsPanning(false);
  };

  // Wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    setScale((s) => Math.max(0.3, Math.min(2, s + delta)));
  };

  // Minimap viewport click
  const handleMinimapClick = (x: number, y: number) => {
    if (!containerRef.current || !layout) return;
    const rect = containerRef.current.getBoundingClientRect();
    setPan({
      x: -(x - rect.width / 2 / scale),
      y: -(y - rect.height / 2 / scale),
    });
  };

  // View mode change
  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    if (mode !== 'all' && !selectedPerson && data?.people.length) {
      setSelectedPerson(data.people[0]);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="space-y-4 text-center">
          <Skeleton className="h-8 w-48 mx-auto" />
          <Skeleton className="h-64 w-96" />
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="py-12 text-center">
          <p className="text-destructive">Lỗi khi tải dữ liệu: {error.message}</p>
        </CardContent>
      </Card>
    );
  }

  // Empty state
  if (!layout || layout.nodes.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <p>Chưa có dữ liệu để hiển thị cây gia phả</p>
          <Button asChild variant="link" className="mt-2">
            <Link href="/people/new">Thêm thành viên đầu tiên</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const viewBox = {
    x: -pan.x / scale,
    y: -pan.y / scale,
    width: containerSize.width / scale,
    height: containerSize.height / scale,
  };

  return (
    <div className="space-y-4">
      {/* Branch filter */}
      <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/40 rounded-lg border border-dashed">
        <GitBranch className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium shrink-0">Xem nhánh từ:</span>

        {filterRootPerson ? (
          <div className="flex items-center gap-2 bg-primary/10 border border-primary/30 rounded-md px-3 py-1">
            <span className="text-sm font-medium">{filterRootPerson.display_name}</span>
            <span className="text-xs text-muted-foreground">Đời {filterRootPerson.generation}</span>
            <button
              onClick={() => handleSetFilterRoot(null)}
              className="ml-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div className="relative">
            <div className="relative">
              <Search className="absolute left-2.5 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Tìm thành viên..."
                value={filterSearch}
                onChange={(e) => {
                  setFilterSearch(e.target.value);
                  setFilterDropdownOpen(e.target.value.length >= 2);
                }}
                onFocus={() => filterSearch.length >= 2 && setFilterDropdownOpen(true)}
                onBlur={() => setTimeout(() => setFilterDropdownOpen(false), 200)}
                className="pl-8 pr-3 py-1 text-sm border rounded-md bg-background w-48 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            {filterDropdownOpen && data?.people && (
              <div className="absolute z-50 top-full mt-1 bg-background border rounded-md shadow-lg w-64 max-h-48 overflow-y-auto">
                {data.people
                  .filter((p) =>
                    filterSearch.length >= 2 &&
                    p.display_name.toLowerCase().includes(filterSearch.toLowerCase())
                  )
                  .slice(0, 10)
                  .map((person) => (
                    <button
                      key={person.id}
                      onMouseDown={() => handleSetFilterRoot(person)}
                      className="w-full text-left flex items-center gap-2 px-3 py-2 hover:bg-muted transition-colors"
                    >
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium shrink-0 ${
                          person.gender === 1 ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'
                        }`}
                      >
                        {person.display_name.slice(-1)}
                      </div>
                      <div>
                        <p className="text-xs font-medium">{person.display_name}</p>
                        <p className="text-[10px] text-muted-foreground">Đời {person.generation}</p>
                      </div>
                    </button>
                  ))}
              </div>
            )}
          </div>
        )}

        {filterRootPerson && (
          <Button variant="outline" size="sm" onClick={() => handleSetFilterRoot(null)}>
            ← Về nhánh chính
          </Button>
        )}

        {filterRootPerson && (
          <span className="text-xs text-muted-foreground ml-auto">
            Nhánh {filterRootPerson.display_name} · Đời {filterRootPerson.generation}
          </span>
        )}
        {!filterRootPerson && (
          <span className="text-xs text-muted-foreground ml-auto">Đang xem: Nhánh chính</span>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Zoom controls */}
        <div className="flex items-center gap-1 border rounded-lg p-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleZoomOut}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-sm w-12 text-center">{Math.round(scale * 100)}%</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleZoomIn}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleReset}>
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>

        {/* View mode filter */}
        <Select value={viewMode} onValueChange={(v) => handleViewModeChange(v as ViewMode)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              <span className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Tất cả
              </span>
            </SelectItem>
            <SelectItem value="ancestors">
              <span className="flex items-center gap-2">
                <ArrowUpFromLine className="h-4 w-4" />
                Tổ tiên
              </span>
            </SelectItem>
            <SelectItem value="descendants">
              <span className="flex items-center gap-2">
                <ArrowDownFromLine className="h-4 w-4" />
                Con cháu
              </span>
            </SelectItem>
          </SelectContent>
        </Select>

        {/* Toggle minimap */}
        <Button
          variant={showMinimap ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setShowMinimap(!showMinimap)}
          className="hidden md:flex"
        >
          <Maximize2 className="h-4 w-4 mr-2" />
          Minimap
        </Button>

        {/* Arrange mode (drag & drop nodes) */}
        <Button
          variant={editMode ? 'default' : 'outline'}
          size="sm"
          onClick={() => setEditMode((v) => !v)}
        >
          <Move className="h-4 w-4 mr-2" />
          {editMode ? 'Xong' : 'Sắp xếp'}
        </Button>
        {editMode && (
          <>
            <Button
              variant={moveBranch ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setMoveBranch((v) => !v)}
              title="Bật: kéo một người sẽ kéo theo vợ/chồng và con cháu"
            >
              <GitBranch className="h-4 w-4 mr-2" />
              Kéo cả nhánh: {moveBranch ? 'Bật' : 'Tắt'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetLayout}
              disabled={Object.keys(offsets).length === 0}
            >
              <Undo2 className="h-4 w-4 mr-2" />
              Đặt lại vị trí
            </Button>
          </>
        )}

        {/* Pan indicator */}
        <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          <Move className="h-3 w-3" />
          <span className="hidden sm:inline">
            {editMode ? 'Kéo ô để dời chỗ (lưu trên máy này) · ◀ ▶ đổi thứ tự anh em (lưu cho cả họ)' : 'Kéo để di chuyển'}
          </span>
        </div>
      </div>

      {/* View mode info */}
      {viewMode !== 'all' && selectedPerson && (
        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            {viewMode === 'ancestors' ? 'Tổ tiên của' : 'Con cháu của'}: {selectedPerson.display_name}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setViewMode('all')}
          >
            Xem tất cả
          </Button>
        </div>
      )}

      {/* Tree container */}
      <div
        ref={containerCallbackRef}
        className="border rounded-lg bg-muted/30 overflow-hidden relative select-none"
        style={{ height: '60vh', cursor: isPanning ? 'grabbing' : 'grab', touchAction: 'none' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
      >
        <svg
          width="100%"
          height="100%"
          style={{ minWidth: '100%', minHeight: '100%' }}
        >
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`}>
            <g transform={`translate(${layout.offsetX}, 0)`}>
              {/* Connections first (behind nodes) */}
              <AnimatePresence>
                {layout.connections.map((conn) => (
                  <TreeConnection key={conn.id} connection={conn} />
                ))}
              </AnimatePresence>

              {/* Nodes */}
              <AnimatePresence>
                {layout.nodes.map((node) => (
                  <TreeNode
                    key={node.person.id}
                    node={node}
                    onSelect={handleSelectNode}
                    onToggleCollapse={handleToggleCollapse}
                    isSelected={selectedPerson?.id === node.person.id}
                    editMode={editMode}
                    onDragStart={handleNodeDragStart}
                    onOpenExternal={handleOpenExternal}
                    canArrange={canArrange}
                    onMoveSibling={handleMoveSibling}
                  />
                ))}
              </AnimatePresence>
            </g>
          </g>
        </svg>

        {/* Minimap */}
        {showMinimap && layout.nodes.length > 3 && (
          <Minimap
            nodes={layout.nodes}
            viewBox={viewBox}
            treeWidth={layout.width}
            treeHeight={layout.height}
            onViewportClick={handleMinimapClick}
          />
        )}
      </div>

      {/* Selected person info */}
      <AnimatePresence>
        {selectedPerson && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
          >
            <Card>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={selectedPerson.avatar_url} />
                    <AvatarFallback>
                      {selectedPerson.display_name.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="font-semibold">{selectedPerson.display_name}</h3>
                    <p className="text-sm text-muted-foreground">
                      Đời {selectedPerson.generation}
                      {selectedPerson.chi && ` • Chi ${selectedPerson.chi}`}
                      {!selectedPerson.is_living && ' • Đã mất'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {viewMode === 'all' && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewModeChange('ancestors')}
                      >
                        <ArrowUpFromLine className="h-4 w-4 mr-1" />
                        <span className="hidden sm:inline">Tổ tiên</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewModeChange('descendants')}
                      >
                        <ArrowDownFromLine className="h-4 w-4 mr-1" />
                        <span className="hidden sm:inline">Con cháu</span>
                      </Button>
                    </>
                  )}
                  <Button asChild size="sm">
                    <Link href={`/people/${selectedPerson.id}`}>
                      Xem chi tiết
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
