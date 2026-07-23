import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * One-off cleanup: removes a fixed, hand-verified list of orphaned objects
 * in markom-content-submissions (failed/retried uploads with no
 * markom_content_submissions/markom_content_submission_photos row pointing
 * to them anymore -- verified via a NOT IN query against both tables before
 * this list was hardcoded here). Storage's own delete trigger blocks plain
 * SQL DELETE on storage.objects, so this goes through the Storage API via
 * the admin client instead. The path list is fixed on purpose (no arbitrary
 * path input) so hitting this route again is a harmless no-op, never a way
 * to delete anything else. Safe to remove this route once run.
 */
const ORPHANED_PATHS = [
  "f59c5554-b682-4fb0-ad27-298aa741cd34/1784789577480-IMG_4768.MOV",
  "7a4f0c9f-3b8e-4d87-9867-ac3739cb76ac/1784694141626-22_Julii.mov",
  "7a4f0c9f-3b8e-4d87-9867-ac3739cb76ac/1784694347956-22_Julii.mov",
  "7a4f0c9f-3b8e-4d87-9867-ac3739cb76ac/1784694411919-22_Julii.mov",
  "7a4f0c9f-3b8e-4d87-9867-ac3739cb76ac/1784694540804-22_Julii.mov",
  "7a4f0c9f-3b8e-4d87-9867-ac3739cb76ac/1784696927766-copy_B5F9FB32-D860-4013-B772-37E3C82AE2A1.mov",
  "7a4f0c9f-3b8e-4d87-9867-ac3739cb76ac/1784697120028-copy_B5F9FB32-D860-4013-B772-37E3C82AE2A1.mov",
  "7a4f0c9f-3b8e-4d87-9867-ac3739cb76ac/1784697910289-copy_B5F9FB32-D860-4013-B772-37E3C82AE2A1.mov",
  "7a4f0c9f-3b8e-4d87-9867-ac3739cb76ac/1784696483164-copy_B5F9FB32-D860-4013-B772-37E3C82AE2A1.mov",
  "7a4f0c9f-3b8e-4d87-9867-ac3739cb76ac/1784696629154-copy_B5F9FB32-D860-4013-B772-37E3C82AE2A1.mov",
  "7a4f0c9f-3b8e-4d87-9867-ac3739cb76ac/1784696688278-copy_B5F9FB32-D860-4013-B772-37E3C82AE2A1.mov",
  "7a4f0c9f-3b8e-4d87-9867-ac3739cb76ac/1784696753675-copy_B5F9FB32-D860-4013-B772-37E3C82AE2A1.mov",
  "7a4f0c9f-3b8e-4d87-9867-ac3739cb76ac/1784714431923-copy_B5F9FB32-D860-4013-B772-37E3C82AE2A1.mov",
  "7a4f0c9f-3b8e-4d87-9867-ac3739cb76ac/1784693384814-22_Juli.mov",
  "7a4f0c9f-3b8e-4d87-9867-ac3739cb76ac/1784775616751-copy_4E6125A6-72F1-4882-8A6C-2ED16ED6795B.mov",
  "7a4f0c9f-3b8e-4d87-9867-ac3739cb76ac/1784777610839-copy_E5FC7BC4-4454-4CF9-90F2-CB8666A418B6.mov",
  "7a4f0c9f-3b8e-4d87-9867-ac3739cb76ac/1784780574642-copy_D3C81C51-8E32-4C10-9576-68C6E6D27028.mov",
  "7a4f0c9f-3b8e-4d87-9867-ac3739cb76ac/1784780609365-copy_D3C81C51-8E32-4C10-9576-68C6E6D27028.mov",
  "7a4f0c9f-3b8e-4d87-9867-ac3739cb76ac/1784772533866-copy_7230878E-55AE-4298-A340-A7CA85333DAA.mov",
  // 4b400622-.../1784795744811-POV_punya_villa_di_jogja.mp4 intentionally excluded --
  // created only minutes before this list was captured, could be a real in-flight
  // upload (submission row not committed yet) rather than a stale orphan.
  "7dedc970-71bc-4e28-8baa-89151af39af7/1784714734090-03_FEED_CARAUSEL_LOONARS_VILLA_JULI_2026_-_Post_5_mei.png",
  "7dedc970-71bc-4e28-8baa-89151af39af7/1784714734091-03_FEED_CARAUSEL_LOONARS_VILLA_JULI_2026_-_2.png",
  "7dedc970-71bc-4e28-8baa-89151af39af7/1784714734091-03_FEED_CARAUSEL_LOONARS_VILLA_JULI_2026_-_3.png",
  "7dedc970-71bc-4e28-8baa-89151af39af7/1784714734091-03_FEED_CARAUSEL_LOONARS_VILLA_JULI_2026_-_4.png",
  "7dedc970-71bc-4e28-8baa-89151af39af7/1784714734091-03_FEED_CARAUSEL_LOONARS_VILLA_JULI_2026_-_5.png",
];

async function run() {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage.from("markom-content-submissions").remove(ORPHANED_PATHS);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ removed: data?.length ?? 0 });
}

export const POST = run;
export const GET = run;
