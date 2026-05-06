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
import { BOX_AWK } from './awk.ts'
import { BOX_BASE64 } from './base64_cmd.ts'
import { BOX_BASENAME } from './basename.ts'
import { BOX_CAT } from './cat.ts'
import { BOX_CMP } from './cmp.ts'
import { BOX_CUT } from './cut.ts'
import { BOX_DIFF } from './diff.ts'
import { BOX_DIRNAME } from './dirname.ts'
import { BOX_DU } from './du.ts'
import { BOX_FILE } from './file.ts'
import { BOX_FIND } from './find.ts'
import { BOX_GREP } from './grep.ts'
import { BOX_HEAD } from './head.ts'
import { BOX_JQ } from './jq.ts'
import { BOX_LS } from './ls.ts'
import { BOX_NL } from './nl.ts'
import { BOX_REALPATH } from './realpath.ts'
import { BOX_RG } from './rg.ts'
import { BOX_SED } from './sed.ts'
import { BOX_SORT } from './sort.ts'
import { BOX_STAT } from './stat.ts'
import { BOX_TAIL } from './tail.ts'
import { BOX_TREE } from './tree.ts'
import { BOX_UNIQ } from './uniq.ts'
import { BOX_WC } from './wc.ts'
import { BOX_CAT_FEATHER } from './cat_feather.ts'
import { BOX_CAT_HDF5 } from './cat_hdf5.ts'
import { BOX_CAT_PARQUET } from './cat_parquet.ts'
import { BOX_CUT_FEATHER } from './cut_feather.ts'
import { BOX_CUT_HDF5 } from './cut_hdf5.ts'
import { BOX_CUT_PARQUET } from './cut_parquet.ts'
import { BOX_FILE_FEATHER } from './file_feather.ts'
import { BOX_FILE_HDF5 } from './file_hdf5.ts'
import { BOX_FILE_PARQUET } from './file_parquet.ts'
import { BOX_GREP_FEATHER } from './grep_feather.ts'
import { BOX_GREP_HDF5 } from './grep_hdf5.ts'
import { BOX_GREP_PARQUET } from './grep_parquet.ts'
import { BOX_HEAD_FEATHER } from './head_feather.ts'
import { BOX_HEAD_HDF5 } from './head_hdf5.ts'
import { BOX_HEAD_PARQUET } from './head_parquet.ts'
import { BOX_LS_FEATHER } from './ls_feather.ts'
import { BOX_LS_HDF5 } from './ls_hdf5.ts'
import { BOX_LS_PARQUET } from './ls_parquet.ts'
import { BOX_STAT_FEATHER } from './stat_feather.ts'
import { BOX_STAT_HDF5 } from './stat_hdf5.ts'
import { BOX_STAT_PARQUET } from './stat_parquet.ts'
import { BOX_TAIL_FEATHER } from './tail_feather.ts'
import { BOX_TAIL_HDF5 } from './tail_hdf5.ts'
import { BOX_TAIL_PARQUET } from './tail_parquet.ts'
import { BOX_WC_FEATHER } from './wc_feather.ts'
import { BOX_WC_HDF5 } from './wc_hdf5.ts'
import { BOX_WC_PARQUET } from './wc_parquet.ts'

export const BOX_COMMANDS: readonly RegisteredCommand[] = [
  ...BOX_AWK,
  ...BOX_BASE64,
  ...BOX_BASENAME,
  ...BOX_CAT,
  ...BOX_CAT_FEATHER,
  ...BOX_CAT_HDF5,
  ...BOX_CAT_PARQUET,
  ...BOX_CMP,
  ...BOX_CUT,
  ...BOX_CUT_FEATHER,
  ...BOX_CUT_HDF5,
  ...BOX_CUT_PARQUET,
  ...BOX_DIFF,
  ...BOX_DIRNAME,
  ...BOX_DU,
  ...BOX_FILE,
  ...BOX_FILE_FEATHER,
  ...BOX_FILE_HDF5,
  ...BOX_FILE_PARQUET,
  ...BOX_FIND,
  ...BOX_GREP,
  ...BOX_GREP_FEATHER,
  ...BOX_GREP_HDF5,
  ...BOX_GREP_PARQUET,
  ...BOX_HEAD,
  ...BOX_HEAD_FEATHER,
  ...BOX_HEAD_HDF5,
  ...BOX_HEAD_PARQUET,
  ...BOX_JQ,
  ...BOX_LS,
  ...BOX_LS_FEATHER,
  ...BOX_LS_HDF5,
  ...BOX_LS_PARQUET,
  ...BOX_NL,
  ...BOX_REALPATH,
  ...BOX_RG,
  ...BOX_SED,
  ...BOX_SORT,
  ...BOX_STAT,
  ...BOX_STAT_FEATHER,
  ...BOX_STAT_HDF5,
  ...BOX_STAT_PARQUET,
  ...BOX_TAIL,
  ...BOX_TAIL_FEATHER,
  ...BOX_TAIL_HDF5,
  ...BOX_TAIL_PARQUET,
  ...BOX_TREE,
  ...BOX_UNIQ,
  ...BOX_WC,
  ...BOX_WC_FEATHER,
  ...BOX_WC_HDF5,
  ...BOX_WC_PARQUET,
]
