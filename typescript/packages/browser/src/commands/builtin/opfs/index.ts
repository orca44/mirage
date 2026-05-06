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

import type { RegisteredCommand } from '@struktoai/mirage-core'
import { OPFS_AWK } from './awk.ts'
import { RAM_BASE64 } from './base64_cmd.ts'
import { OPFS_BASENAME } from './basename.ts'
import { OPFS_CAT } from './cat/cat.ts'
import { OPFS_CAT_FEATHER } from './cat/cat_feather.ts'
import { RAM_CAT_HDF5 } from './cat/cat_hdf5.ts'
import { OPFS_CAT_PARQUET } from './cat/cat_parquet.ts'
import { OPFS_CMP } from './cmp.ts'
import { OPFS_COLUMN } from './column.ts'
import { OPFS_COMM } from './comm.ts'
import { OPFS_CP } from './cp.ts'
import { OPFS_CSPLIT } from './csplit.ts'
import { OPFS_CUT } from './cut/cut.ts'
import { OPFS_CUT_FEATHER } from './cut/cut_feather.ts'
import { RAM_CUT_HDF5 } from './cut/cut_hdf5.ts'
import { OPFS_CUT_PARQUET } from './cut/cut_parquet.ts'
import { OPFS_DIFF } from './diff.ts'
import { OPFS_DIRNAME } from './dirname.ts'
import { OPFS_DU } from './du.ts'
import { OPFS_EXPAND } from './expand.ts'
import { OPFS_FILE } from './file/file.ts'
import { OPFS_FILE_FEATHER } from './file/file_feather.ts'
import { RAM_FILE_HDF5 } from './file/file_hdf5.ts'
import { OPFS_FILE_PARQUET } from './file/file_parquet.ts'
import { OPFS_FIND } from './find.ts'
import { OPFS_FMT } from './fmt.ts'
import { OPFS_FOLD } from './fold.ts'
import { OPFS_GREP } from './grep/grep.ts'
import { OPFS_GREP_FEATHER } from './grep/grep_feather.ts'
import { RAM_GREP_HDF5 } from './grep/grep_hdf5.ts'
import { OPFS_GREP_PARQUET } from './grep/grep_parquet.ts'
import { OPFS_GUNZIP } from './gunzip.ts'
import { OPFS_GZIP } from './gzip.ts'
import { OPFS_HEAD } from './head/head.ts'
import { OPFS_HEAD_FEATHER } from './head/head_feather.ts'
import { RAM_HEAD_HDF5 } from './head/head_hdf5.ts'
import { OPFS_HEAD_PARQUET } from './head/head_parquet.ts'
import { OPFS_ICONV } from './iconv.ts'
import { OPFS_JOIN } from './join.ts'
import { OPFS_JQ } from './jq.ts'
import { OPFS_LN } from './ln.ts'
import { OPFS_LOOK } from './look.ts'
import { OPFS_LS } from './ls/ls.ts'
import { OPFS_LS_FEATHER } from './ls/ls_feather.ts'
import { RAM_LS_HDF5 } from './ls/ls_hdf5.ts'
import { OPFS_LS_PARQUET } from './ls/ls_parquet.ts'
import { RAM_MD5 } from './md5.ts'
import { OPFS_MKDIR } from './mkdir.ts'
import { OPFS_MKTEMP } from './mktemp.ts'
import { OPFS_MV } from './mv.ts'
import { OPFS_NL } from './nl.ts'
import { OPFS_PASTE } from './paste.ts'
import { OPFS_PATCH } from './patch.ts'
import { OPFS_READLINK } from './readlink.ts'
import { OPFS_REALPATH } from './realpath.ts'
import { OPFS_REV } from './rev.ts'
import { OPFS_RG } from './rg.ts'
import { OPFS_RM } from './rm.ts'
import { OPFS_SED } from './sed.ts'
import { RAM_SHA256SUM } from './sha256sum.ts'
import { OPFS_SHUF } from './shuf.ts'
import { OPFS_SORT } from './sort.ts'
import { OPFS_SPLIT } from './split.ts'
import { OPFS_STAT } from './stat/stat.ts'
import { OPFS_STAT_FEATHER } from './stat/stat_feather.ts'
import { RAM_STAT_HDF5 } from './stat/stat_hdf5.ts'
import { OPFS_STAT_PARQUET } from './stat/stat_parquet.ts'
import { OPFS_STRINGS } from './strings.ts'
import { OPFS_TAC } from './tac.ts'
import { OPFS_TAIL } from './tail/tail.ts'
import { OPFS_TAIL_FEATHER } from './tail/tail_feather.ts'
import { RAM_TAIL_HDF5 } from './tail/tail_hdf5.ts'
import { OPFS_TAIL_PARQUET } from './tail/tail_parquet.ts'
import { OPFS_TAR } from './tar.ts'
import { OPFS_TEE } from './tee.ts'
import { OPFS_TOUCH } from './touch.ts'
import { OPFS_TR } from './tr.ts'
import { OPFS_TREE } from './tree.ts'
import { OPFS_TSORT } from './tsort.ts'
import { OPFS_UNEXPAND } from './unexpand.ts'
import { OPFS_UNIQ } from './uniq.ts'
import { OPFS_UNZIP } from './unzip.ts'
import { OPFS_WC } from './wc/wc.ts'
import { OPFS_WC_FEATHER } from './wc/wc_feather.ts'
import { RAM_WC_HDF5 } from './wc/wc_hdf5.ts'
import { OPFS_WC_PARQUET } from './wc/wc_parquet.ts'
import { OPFS_XXD } from './xxd.ts'
import { OPFS_ZCAT } from './zcat.ts'
import { OPFS_ZGREP } from './zgrep.ts'
import { OPFS_ZIP } from './zip_cmd.ts'

export const OPFS_COMMANDS: readonly RegisteredCommand[] = [
  ...OPFS_AWK,
  ...RAM_BASE64,
  ...OPFS_BASENAME,
  ...OPFS_CAT,
  ...OPFS_CAT_FEATHER,
  ...RAM_CAT_HDF5,
  ...OPFS_CAT_PARQUET,
  ...OPFS_CMP,
  ...OPFS_COLUMN,
  ...OPFS_COMM,
  ...OPFS_CP,
  ...OPFS_CSPLIT,
  ...OPFS_CUT,
  ...OPFS_CUT_FEATHER,
  ...RAM_CUT_HDF5,
  ...OPFS_CUT_PARQUET,
  ...OPFS_DIFF,
  ...OPFS_DIRNAME,
  ...OPFS_DU,
  ...OPFS_EXPAND,
  ...OPFS_FILE,
  ...OPFS_FILE_FEATHER,
  ...RAM_FILE_HDF5,
  ...OPFS_FILE_PARQUET,
  ...OPFS_FIND,
  ...OPFS_FMT,
  ...OPFS_FOLD,
  ...OPFS_GREP,
  ...OPFS_GREP_FEATHER,
  ...RAM_GREP_HDF5,
  ...OPFS_GREP_PARQUET,
  ...OPFS_GUNZIP,
  ...OPFS_GZIP,
  ...OPFS_HEAD,
  ...OPFS_HEAD_FEATHER,
  ...RAM_HEAD_HDF5,
  ...OPFS_HEAD_PARQUET,
  ...OPFS_ICONV,
  ...OPFS_JOIN,
  ...OPFS_JQ,
  ...OPFS_LN,
  ...OPFS_LOOK,
  ...OPFS_LS,
  ...OPFS_LS_FEATHER,
  ...RAM_LS_HDF5,
  ...OPFS_LS_PARQUET,
  ...RAM_MD5,
  ...OPFS_MKDIR,
  ...OPFS_MKTEMP,
  ...OPFS_MV,
  ...OPFS_NL,
  ...OPFS_PASTE,
  ...OPFS_PATCH,
  ...OPFS_READLINK,
  ...OPFS_REALPATH,
  ...OPFS_REV,
  ...OPFS_RG,
  ...OPFS_RM,
  ...OPFS_SED,
  ...RAM_SHA256SUM,
  ...OPFS_SHUF,
  ...OPFS_SORT,
  ...OPFS_SPLIT,
  ...OPFS_STAT,
  ...OPFS_STAT_FEATHER,
  ...RAM_STAT_HDF5,
  ...OPFS_STAT_PARQUET,
  ...OPFS_STRINGS,
  ...OPFS_TAC,
  ...OPFS_TAIL,
  ...OPFS_TAIL_FEATHER,
  ...RAM_TAIL_HDF5,
  ...OPFS_TAIL_PARQUET,
  ...OPFS_TAR,
  ...OPFS_TEE,
  ...OPFS_TOUCH,
  ...OPFS_TR,
  ...OPFS_TREE,
  ...OPFS_TSORT,
  ...OPFS_UNEXPAND,
  ...OPFS_UNIQ,
  ...OPFS_UNZIP,
  ...OPFS_WC,
  ...OPFS_WC_FEATHER,
  ...RAM_WC_HDF5,
  ...OPFS_WC_PARQUET,
  ...OPFS_XXD,
  ...OPFS_ZCAT,
  ...OPFS_ZGREP,
  ...OPFS_ZIP,
]
