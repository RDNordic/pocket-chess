# Puzzle storyboard - discussion draft

Date: 2026-10-06. Review artifact only; no application implementation.

Review feedback (2026-10-06): keep three on-request hints, encouraging an
independent attempt first and supporting completion and a sense of mastery.
The visual should be bright, soft and child-friendly: cheerful greens, warm
yellow accents, rounded shapes and gentle contours. The reference informs
these qualities, not copied artwork or branding. The revised storyboard uses
a light product surface even inside a dark conversation theme. Exact art and
palette remain reviewable.

“See Black's escape” replaces the ambiguous “Show reply” label in the visual.
It optionally demonstrates the defence to the unsuccessful attempt; Try again
is available immediately without watching it. This interaction is still a
proposal, not an agreed requirement.

Further visual feedback (2026-10-06): increase brightness again and use familiar
filled, strongly outlined chess pieces rather than Unicode glyphs. The supplied
piece screenshot is a style/familiarity reference; its exact asset source and
reuse licence are not established. The visual now reuses this repo's existing
cburnett SVGs (Colin M.L. Burnett, GPLv2+, used under GPLv3), unchanged, as a
close classic alternative rather than claiming an exact match. Application
assets and rendering are untouched.

Read-only asset research authorised in this follow-up found two candidates:
[Kenney UI Pack](https://kenney.nl/assets/ui-pack) and
[Kenney Animal Pack Remastered](https://kenney.nl/assets/animal-pack-remastered).
Both official pages list CC0; the [CC0 terms](https://creativecommons.org/publicdomain/zero/1.0/)
permit copying, modification and distribution. The user subsequently chose
Animal Pack Remastered as the preferred character direction; UI Pack remains
a candidate. No assets have been downloaded, and neither pack is claimed to
provide a complete wardrobe system.
Preserve the included licence and source record when acquisition is authorised.
Music sourcing and individual-track verification remain separate and unresolved.

## Design intent

Visual thesis: a calm, warm chess workspace with a large board, familiar pieces
and encouraging, specific language; playful art can be added without crowding it.
Content plan: goal and turn, dominant board, one feedback area, compact actions.
Interaction thesis: clear piece selection, a short opponent-move transition,
and a deliberate completion/replay choice. Avoid motion that holds up the player;
reduced motion removes movement. The storyboard uses instant transitions.

English is placeholder copy. Artwork, palette, music and rewards are not being
approved by this interaction review. The inline view is a scripted storyboard,
not the app or a general chess board. Scene controls let the reviewer inspect
all states; product controls demonstrate the proposed progression.

## Illustrative position

For local UX verification only, use this sparse example: White king f6,
White queen e4, Black king h8, White to move.

FEN: `7k/8/5K2/8/4Q3/8/8/8 w - - 0 1`.

Illustrated line: `1. Qe7 Kg8 2. Qg7#`.
This is not presented as licensed imported content or a unique-solution puzzle.
The installed chess.js is used offline to check every legal first move, every
legal Black reply and all legal mating finishes at this depth. Several first
moves work; this is useful for checking that the design need not force one line.
The build will use curated licensed source content after sourcing is authorised.

## Scenes and proposed rules

| Scene | Player sees/does | Behaviour to agree |
|---|---|---|
| Choose | Mate in two, short description, Start | Theme/difficulty selectors belong to the real library; no pretend choices in this single-example storyboard |
| Your move | White to play; "Checkmate in two of your moves" | Select piece, show legal targets; tap destination; Home and Hint stay available |
| Hints | One clue at a time | Concept: restrict the king; piece: queen; destination: e7 for this illustrated line. Other winning moves remain valid |
| Illegal input | Position stays put; show legal targets | No counted attempt, penalty or harsh sound |
| Legal unsuccessful attempt | Attempted position remains visible | For Qh4+, show the verified defence Kg8 on request; explain only the checked objective failure, not generic "bad move" |
| Retry | Return to the decision checkpoint | Proposed default: retry the decision just missed, retaining preceding correct moves; optional restart from the beginning |
| Opponent reply | Opponent turn, then highlighted reply | No player input during the reply. Actual app uses a short transition, not a Continue button; storyboard Next controls inspection |
| Second decision | "One more move: find checkmate" | Hints now refer to this position; no stale hint arrows from the first move |
| Solved | Specific explanation, Replay / Another / Home | No automatic next puzzle; don't require another activity or a reward ceremony |
| Replay | Start / previous / next and move text | Board is read-only; leaving replay preserves completion and returns to the result |
| Save problem | "Progress isn't saved on this device" | Current puzzle remains playable; offer retry saving. A simulated save success in the storyboard is not actual persistence |

For unrecognised but legal lines, use neutral copy unless an authored refutation
or independent objective validator supports something stronger. Stored canonical
line mismatch alone is insufficient evidence that the goal has failed.

## Content and runtime boundaries

- Source puzzle FEN and the first displayed position may differ when source
  data includes an opponent setup move. Normalise and test this explicitly.
- Content must represent accepted branches and all required defences. Choosing
  one opponent reply for display is not the same as proving the objective.
- Hint/explanation content is reviewed and deterministic. No online analysis
  or runtime text generation is required for the ordinary puzzle loop.
- Move legality and candidate-position checks stay inside the chess domain.
- Selection/hint state stays separate from puzzle progress and saving status.
- Replay and attempts do not duplicate completion or milestone awards.

## Questions for storyboard review

1. Does the board/feedback balance feel appropriate, and is the language
   respectful of an experienced reader?
2. Keep the unsuccessful position until Try again, with an optional See Black's escape?
3. Three explicit, on-request hint steps are confirmed; encourage trying independently first.
4. Is the proposed retry checkpoint right, and how much replay is useful?

After agreement, sketch guided bot play and translate both journeys into the
contracts and acceptance checks in Stage B of plan-build.md.
