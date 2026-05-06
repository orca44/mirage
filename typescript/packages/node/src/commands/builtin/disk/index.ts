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
import { DISK_AWK } from './awk.ts'
import { RAM_BASE64 } from './base64_cmd.ts'
import { DISK_BASENAME } from './basename.ts'
import { DISK_CAT } from './cat/cat.ts'
import { DISK_CAT_FEATHER } from './cat/cat_feather.ts'
import { RAM_CAT_HDF5 } from './cat/cat_hdf5.ts'
import { DISK_CAT_PARQUET } from './cat/cat_parquet.ts'
import { DISK_CMP } from './cmp.ts'
import { DISK_COLUMN } from './column.ts'
import { DISK_COMM } from './comm.ts'
import { DISK_CP } from './cp.ts'
import { DISK_CSPLIT } from './csplit.ts'
import { DISK_CUT } from './cut/cut.ts'
import { DISK_CUT_FEATHER } from './cut/cut_feather.ts'
import { RAM_CUT_HDF5 } from './cut/cut_hdf5.ts'
import { DISK_CUT_PARQUET } from './cut/cut_parquet.ts'
import { DISK_DIFF } from './diff.ts'
import { DISK_DIRNAME } from './dirname.ts'
import { DISK_DU } from './du.ts'
import { DISK_EXPAND } from './expand.ts'
import { DISK_FILE } from './file/file.ts'
import { DISK_FILE_FEATHER } from './file/file_feather.ts'
import { RAM_FILE_HDF5 } from './file/file_hdf5.ts'
import { DISK_FILE_PARQUET } from './file/file_parquet.ts'
import { DISK_FIND } from './find.ts'
import { DISK_FMT } from './fmt.ts'
import { DISK_FOLD } from './fold.ts'
import { DISK_GREP } from './grep/grep.ts'
import { DISK_GREP_FEATHER } from './grep/grep_feather.ts'
import { RAM_GREP_HDF5 } from './grep/grep_hdf5.ts'
import { DISK_GREP_PARQUET } from './grep/grep_parquet.ts'
import { DISK_GUNZIP } from './gunzip.ts'
import { DISK_GZIP } from './gzip.ts'
import { DISK_HEAD } from './head/head.ts'
import { DISK_HEAD_FEATHER } from './head/head_feather.ts'
import { RAM_HEAD_HDF5 } from './head/head_hdf5.ts'
import { DISK_HEAD_PARQUET } from './head/head_parquet.ts'
import { DISK_ICONV } from './iconv.ts'
import { DISK_JOIN } from './join.ts'
import { DISK_JQ } from './jq.ts'
import { DISK_LN } from './ln.ts'
import { DISK_LOOK } from './look.ts'
import { DISK_LS } from './ls/ls.ts'
import { DISK_LS_FEATHER } from './ls/ls_feather.ts'
import { RAM_LS_HDF5 } from './ls/ls_hdf5.ts'
import { DISK_LS_PARQUET } from './ls/ls_parquet.ts'
import { RAM_MD5 } from './md5.ts'
import { DISK_MKDIR } from './mkdir.ts'
import { DISK_MKTEMP } from './mktemp.ts'
import { DISK_MV } from './mv.ts'
import { DISK_NL } from './nl.ts'
import { DISK_PASTE } from './paste.ts'
import { DISK_PATCH } from './patch.ts'
import { DISK_READLINK } from './readlink.ts'
import { DISK_REALPATH } from './realpath.ts'
import { DISK_REV } from './rev.ts'
import { DISK_RG } from './rg.ts'
import { DISK_RM } from './rm.ts'
import { DISK_SED } from './sed.ts'
import { RAM_SHA256SUM } from './sha256sum.ts'
import { DISK_SHUF } from './shuf.ts'
import { DISK_SORT } from './sort.ts'
import { DISK_SPLIT } from './split.ts'
import { DISK_STAT } from './stat/stat.ts'
import { DISK_STAT_FEATHER } from './stat/stat_feather.ts'
import { RAM_STAT_HDF5 } from './stat/stat_hdf5.ts'
import { DISK_STAT_PARQUET } from './stat/stat_parquet.ts'
import { DISK_STRINGS } from './strings.ts'
import { DISK_TAC } from './tac.ts'
import { DISK_TAIL } from './tail/tail.ts'
import { DISK_TAIL_FEATHER } from './tail/tail_feather.ts'
import { RAM_TAIL_HDF5 } from './tail/tail_hdf5.ts'
import { DISK_TAIL_PARQUET } from './tail/tail_parquet.ts'
import { DISK_TAR } from './tar.ts'
import { DISK_TEE } from './tee.ts'
import { DISK_TOUCH } from './touch.ts'
import { DISK_TR } from './tr.ts'
import { DISK_TREE } from './tree.ts'
import { DISK_TSORT } from './tsort.ts'
import { DISK_UNEXPAND } from './unexpand.ts'
import { DISK_UNIQ } from './uniq.ts'
import { DISK_UNZIP } from './unzip.ts'
import { DISK_WC } from './wc/wc.ts'
import { DISK_WC_FEATHER } from './wc/wc_feather.ts'
import { RAM_WC_HDF5 } from './wc/wc_hdf5.ts'
import { DISK_WC_PARQUET } from './wc/wc_parquet.ts'
import { DISK_XXD } from './xxd.ts'
import { DISK_ZCAT } from './zcat.ts'
import { DISK_ZGREP } from './zgrep.ts'
import { DISK_ZIP } from './zip_cmd.ts'

export const DISK_COMMANDS: readonly RegisteredCommand[] = [
  ...DISK_AWK,
  ...RAM_BASE64,
  ...DISK_BASENAME,
  ...DISK_CAT,
  ...DISK_CAT_FEATHER,
  ...RAM_CAT_HDF5,
  ...DISK_CAT_PARQUET,
  ...DISK_CMP,
  ...DISK_COLUMN,
  ...DISK_COMM,
  ...DISK_CP,
  ...DISK_CSPLIT,
  ...DISK_CUT,
  ...DISK_CUT_FEATHER,
  ...RAM_CUT_HDF5,
  ...DISK_CUT_PARQUET,
  ...DISK_DIFF,
  ...DISK_DIRNAME,
  ...DISK_DU,
  ...DISK_EXPAND,
  ...DISK_FILE,
  ...DISK_FILE_FEATHER,
  ...RAM_FILE_HDF5,
  ...DISK_FILE_PARQUET,
  ...DISK_FIND,
  ...DISK_FMT,
  ...DISK_FOLD,
  ...DISK_GREP,
  ...DISK_GREP_FEATHER,
  ...RAM_GREP_HDF5,
  ...DISK_GREP_PARQUET,
  ...DISK_GUNZIP,
  ...DISK_GZIP,
  ...DISK_HEAD,
  ...DISK_HEAD_FEATHER,
  ...RAM_HEAD_HDF5,
  ...DISK_HEAD_PARQUET,
  ...DISK_ICONV,
  ...DISK_JOIN,
  ...DISK_JQ,
  ...DISK_LN,
  ...DISK_LOOK,
  ...DISK_LS,
  ...DISK_LS_FEATHER,
  ...RAM_LS_HDF5,
  ...DISK_LS_PARQUET,
  ...RAM_MD5,
  ...DISK_MKDIR,
  ...DISK_MKTEMP,
  ...DISK_MV,
  ...DISK_NL,
  ...DISK_PASTE,
  ...DISK_PATCH,
  ...DISK_READLINK,
  ...DISK_REALPATH,
  ...DISK_REV,
  ...DISK_RG,
  ...DISK_RM,
  ...DISK_SED,
  ...RAM_SHA256SUM,
  ...DISK_SHUF,
  ...DISK_SORT,
  ...DISK_SPLIT,
  ...DISK_STAT,
  ...DISK_STAT_FEATHER,
  ...RAM_STAT_HDF5,
  ...DISK_STAT_PARQUET,
  ...DISK_STRINGS,
  ...DISK_TAC,
  ...DISK_TAIL,
  ...DISK_TAIL_FEATHER,
  ...RAM_TAIL_HDF5,
  ...DISK_TAIL_PARQUET,
  ...DISK_TAR,
  ...DISK_TEE,
  ...DISK_TOUCH,
  ...DISK_TR,
  ...DISK_TREE,
  ...DISK_TSORT,
  ...DISK_UNEXPAND,
  ...DISK_UNIQ,
  ...DISK_UNZIP,
  ...DISK_WC,
  ...DISK_WC_FEATHER,
  ...RAM_WC_HDF5,
  ...DISK_WC_PARQUET,
  ...DISK_XXD,
  ...DISK_ZCAT,
  ...DISK_ZGREP,
  ...DISK_ZIP,
]
