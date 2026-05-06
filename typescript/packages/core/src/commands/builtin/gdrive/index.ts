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
import { ResourceName } from '../../../types.ts'
import { GDOCS_COMMANDS } from '../gdocs/index.ts'
import { GSHEETS_COMMANDS } from '../gsheets/index.ts'
import { GSLIDES_COMMANDS } from '../gslides/index.ts'
import { GDRIVE_AWK } from './awk.ts'
import { GDRIVE_BASE64 } from './base64_cmd.ts'
import { GDRIVE_BASENAME } from './basename.ts'
import { GDRIVE_CAT } from './cat.ts'
import { GDRIVE_CMP } from './cmp.ts'
import { GDRIVE_CUT } from './cut.ts'
import { GDRIVE_DIFF } from './diff.ts'
import { GDRIVE_DIRNAME } from './dirname.ts'
import { GDRIVE_DU } from './du.ts'
import { GDRIVE_FILE } from './file.ts'
import { GDRIVE_FIND } from './find.ts'
import { GDRIVE_GREP } from './grep.ts'
import { GDRIVE_HEAD } from './head.ts'
import { GDRIVE_JQ } from './jq.ts'
import { GDRIVE_LS } from './ls.ts'
import { GDRIVE_NL } from './nl.ts'
import { GDRIVE_REALPATH } from './realpath.ts'
import { GDRIVE_RG } from './rg.ts'
import { GDRIVE_SED } from './sed.ts'
import { GDRIVE_SORT } from './sort.ts'
import { GDRIVE_STAT } from './stat.ts'
import { GDRIVE_TAIL } from './tail.ts'
import { GDRIVE_TREE } from './tree.ts'
import { GDRIVE_UNIQ } from './uniq.ts'
import { GDRIVE_WC } from './wc.ts'
import { GDRIVE_CAT_FEATHER } from './cat_feather.ts'
import { GDRIVE_CAT_HDF5 } from './cat_hdf5.ts'
import { GDRIVE_CAT_PARQUET } from './cat_parquet.ts'
import { GDRIVE_CUT_FEATHER } from './cut_feather.ts'
import { GDRIVE_CUT_HDF5 } from './cut_hdf5.ts'
import { GDRIVE_CUT_PARQUET } from './cut_parquet.ts'
import { GDRIVE_FILE_FEATHER } from './file_feather.ts'
import { GDRIVE_FILE_HDF5 } from './file_hdf5.ts'
import { GDRIVE_FILE_PARQUET } from './file_parquet.ts'
import { GDRIVE_GREP_FEATHER } from './grep_feather.ts'
import { GDRIVE_GREP_HDF5 } from './grep_hdf5.ts'
import { GDRIVE_GREP_PARQUET } from './grep_parquet.ts'
import { GDRIVE_HEAD_FEATHER } from './head_feather.ts'
import { GDRIVE_HEAD_HDF5 } from './head_hdf5.ts'
import { GDRIVE_HEAD_PARQUET } from './head_parquet.ts'
import { GDRIVE_LS_FEATHER } from './ls_feather.ts'
import { GDRIVE_LS_HDF5 } from './ls_hdf5.ts'
import { GDRIVE_LS_PARQUET } from './ls_parquet.ts'
import { GDRIVE_STAT_FEATHER } from './stat_feather.ts'
import { GDRIVE_STAT_HDF5 } from './stat_hdf5.ts'
import { GDRIVE_STAT_PARQUET } from './stat_parquet.ts'
import { GDRIVE_TAIL_FEATHER } from './tail_feather.ts'
import { GDRIVE_TAIL_HDF5 } from './tail_hdf5.ts'
import { GDRIVE_TAIL_PARQUET } from './tail_parquet.ts'
import { GDRIVE_WC_FEATHER } from './wc_feather.ts'
import { GDRIVE_WC_HDF5 } from './wc_hdf5.ts'
import { GDRIVE_WC_PARQUET } from './wc_parquet.ts'

const GDRIVE_NATIVE: readonly RegisteredCommand[] = [
  ...GDRIVE_AWK,
  ...GDRIVE_BASE64,
  ...GDRIVE_BASENAME,
  ...GDRIVE_CAT,
  ...GDRIVE_CAT_FEATHER,
  ...GDRIVE_CAT_HDF5,
  ...GDRIVE_CAT_PARQUET,
  ...GDRIVE_CMP,
  ...GDRIVE_CUT,
  ...GDRIVE_CUT_FEATHER,
  ...GDRIVE_CUT_HDF5,
  ...GDRIVE_CUT_PARQUET,
  ...GDRIVE_DIFF,
  ...GDRIVE_DIRNAME,
  ...GDRIVE_DU,
  ...GDRIVE_FILE,
  ...GDRIVE_FILE_FEATHER,
  ...GDRIVE_FILE_HDF5,
  ...GDRIVE_FILE_PARQUET,
  ...GDRIVE_FIND,
  ...GDRIVE_GREP,
  ...GDRIVE_GREP_FEATHER,
  ...GDRIVE_GREP_HDF5,
  ...GDRIVE_GREP_PARQUET,
  ...GDRIVE_HEAD,
  ...GDRIVE_HEAD_FEATHER,
  ...GDRIVE_HEAD_HDF5,
  ...GDRIVE_HEAD_PARQUET,
  ...GDRIVE_JQ,
  ...GDRIVE_LS,
  ...GDRIVE_LS_FEATHER,
  ...GDRIVE_LS_HDF5,
  ...GDRIVE_LS_PARQUET,
  ...GDRIVE_NL,
  ...GDRIVE_REALPATH,
  ...GDRIVE_RG,
  ...GDRIVE_SED,
  ...GDRIVE_SORT,
  ...GDRIVE_STAT,
  ...GDRIVE_STAT_FEATHER,
  ...GDRIVE_STAT_HDF5,
  ...GDRIVE_STAT_PARQUET,
  ...GDRIVE_TAIL,
  ...GDRIVE_TAIL_FEATHER,
  ...GDRIVE_TAIL_HDF5,
  ...GDRIVE_TAIL_PARQUET,
  ...GDRIVE_TREE,
  ...GDRIVE_UNIQ,
  ...GDRIVE_WC,
  ...GDRIVE_WC_FEATHER,
  ...GDRIVE_WC_HDF5,
  ...GDRIVE_WC_PARQUET,
]

const GWS_FOR_GDRIVE: readonly RegisteredCommand[] = [
  ...GDOCS_COMMANDS.filter((c) => c.resource === ResourceName.GDRIVE),
  ...GSHEETS_COMMANDS.filter((c) => c.resource === ResourceName.GDRIVE),
  ...GSLIDES_COMMANDS.filter((c) => c.resource === ResourceName.GDRIVE),
]

export const GDRIVE_COMMANDS: readonly RegisteredCommand[] = [...GDRIVE_NATIVE, ...GWS_FOR_GDRIVE]
