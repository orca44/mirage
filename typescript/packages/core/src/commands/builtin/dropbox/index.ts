// ========= Copyright 2026 @ Strukto.AI All Rights Reserved. =========
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
// ========= Copyright 2026 @ Strukto.AI All Rights Reserved. =========

import type { RegisteredCommand } from '../../config.ts'
import { DROPBOX_AWK } from './awk.ts'
import { DROPBOX_BASE64 } from './base64_cmd.ts'
import { DROPBOX_BASENAME } from './basename.ts'
import { DROPBOX_CAT } from './cat.ts'
import { DROPBOX_CMP } from './cmp.ts'
import { DROPBOX_CUT } from './cut.ts'
import { DROPBOX_DIFF } from './diff.ts'
import { DROPBOX_DIRNAME } from './dirname.ts'
import { DROPBOX_DU } from './du.ts'
import { DROPBOX_FILE } from './file.ts'
import { DROPBOX_FIND } from './find.ts'
import { DROPBOX_GREP } from './grep.ts'
import { DROPBOX_HEAD } from './head.ts'
import { DROPBOX_JQ } from './jq.ts'
import { DROPBOX_LS } from './ls.ts'
import { DROPBOX_NL } from './nl.ts'
import { DROPBOX_REALPATH } from './realpath.ts'
import { DROPBOX_RG } from './rg.ts'
import { DROPBOX_SED } from './sed.ts'
import { DROPBOX_SORT } from './sort.ts'
import { DROPBOX_STAT } from './stat.ts'
import { DROPBOX_TAIL } from './tail.ts'
import { DROPBOX_TREE } from './tree.ts'
import { DROPBOX_UNIQ } from './uniq.ts'
import { DROPBOX_WC } from './wc.ts'
import { DROPBOX_CAT_FEATHER } from './cat_feather.ts'
import { DROPBOX_CAT_HDF5 } from './cat_hdf5.ts'
import { DROPBOX_CAT_PARQUET } from './cat_parquet.ts'
import { DROPBOX_CUT_FEATHER } from './cut_feather.ts'
import { DROPBOX_CUT_HDF5 } from './cut_hdf5.ts'
import { DROPBOX_CUT_PARQUET } from './cut_parquet.ts'
import { DROPBOX_FILE_FEATHER } from './file_feather.ts'
import { DROPBOX_FILE_HDF5 } from './file_hdf5.ts'
import { DROPBOX_FILE_PARQUET } from './file_parquet.ts'
import { DROPBOX_GREP_FEATHER } from './grep_feather.ts'
import { DROPBOX_GREP_HDF5 } from './grep_hdf5.ts'
import { DROPBOX_GREP_PARQUET } from './grep_parquet.ts'
import { DROPBOX_HEAD_FEATHER } from './head_feather.ts'
import { DROPBOX_HEAD_HDF5 } from './head_hdf5.ts'
import { DROPBOX_HEAD_PARQUET } from './head_parquet.ts'
import { DROPBOX_LS_FEATHER } from './ls_feather.ts'
import { DROPBOX_LS_HDF5 } from './ls_hdf5.ts'
import { DROPBOX_LS_PARQUET } from './ls_parquet.ts'
import { DROPBOX_STAT_FEATHER } from './stat_feather.ts'
import { DROPBOX_STAT_HDF5 } from './stat_hdf5.ts'
import { DROPBOX_STAT_PARQUET } from './stat_parquet.ts'
import { DROPBOX_TAIL_FEATHER } from './tail_feather.ts'
import { DROPBOX_TAIL_HDF5 } from './tail_hdf5.ts'
import { DROPBOX_TAIL_PARQUET } from './tail_parquet.ts'
import { DROPBOX_WC_FEATHER } from './wc_feather.ts'
import { DROPBOX_WC_HDF5 } from './wc_hdf5.ts'
import { DROPBOX_WC_PARQUET } from './wc_parquet.ts'

export const DROPBOX_COMMANDS: readonly RegisteredCommand[] = [
  ...DROPBOX_AWK,
  ...DROPBOX_BASE64,
  ...DROPBOX_BASENAME,
  ...DROPBOX_CAT,
  ...DROPBOX_CAT_FEATHER,
  ...DROPBOX_CAT_HDF5,
  ...DROPBOX_CAT_PARQUET,
  ...DROPBOX_CMP,
  ...DROPBOX_CUT,
  ...DROPBOX_CUT_FEATHER,
  ...DROPBOX_CUT_HDF5,
  ...DROPBOX_CUT_PARQUET,
  ...DROPBOX_DIFF,
  ...DROPBOX_DIRNAME,
  ...DROPBOX_DU,
  ...DROPBOX_FILE,
  ...DROPBOX_FILE_FEATHER,
  ...DROPBOX_FILE_HDF5,
  ...DROPBOX_FILE_PARQUET,
  ...DROPBOX_FIND,
  ...DROPBOX_GREP,
  ...DROPBOX_GREP_FEATHER,
  ...DROPBOX_GREP_HDF5,
  ...DROPBOX_GREP_PARQUET,
  ...DROPBOX_HEAD,
  ...DROPBOX_HEAD_FEATHER,
  ...DROPBOX_HEAD_HDF5,
  ...DROPBOX_HEAD_PARQUET,
  ...DROPBOX_JQ,
  ...DROPBOX_LS,
  ...DROPBOX_LS_FEATHER,
  ...DROPBOX_LS_HDF5,
  ...DROPBOX_LS_PARQUET,
  ...DROPBOX_NL,
  ...DROPBOX_REALPATH,
  ...DROPBOX_RG,
  ...DROPBOX_SED,
  ...DROPBOX_SORT,
  ...DROPBOX_STAT,
  ...DROPBOX_STAT_FEATHER,
  ...DROPBOX_STAT_HDF5,
  ...DROPBOX_STAT_PARQUET,
  ...DROPBOX_TAIL,
  ...DROPBOX_TAIL_FEATHER,
  ...DROPBOX_TAIL_HDF5,
  ...DROPBOX_TAIL_PARQUET,
  ...DROPBOX_TREE,
  ...DROPBOX_UNIQ,
  ...DROPBOX_WC,
  ...DROPBOX_WC_FEATHER,
  ...DROPBOX_WC_HDF5,
  ...DROPBOX_WC_PARQUET,
]
