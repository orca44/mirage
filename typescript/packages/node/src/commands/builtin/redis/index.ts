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
import { REDIS_AWK } from './awk.ts'
import { RAM_BASE64 } from './base64_cmd.ts'
import { REDIS_BASENAME } from './basename.ts'
import { REDIS_CAT } from './cat/cat.ts'
import { REDIS_CAT_FEATHER } from './cat/cat_feather.ts'
import { RAM_CAT_HDF5 } from './cat/cat_hdf5.ts'
import { REDIS_CAT_PARQUET } from './cat/cat_parquet.ts'
import { REDIS_CMP } from './cmp.ts'
import { REDIS_COLUMN } from './column.ts'
import { REDIS_COMM } from './comm.ts'
import { REDIS_CP } from './cp.ts'
import { REDIS_CSPLIT } from './csplit.ts'
import { REDIS_CUT } from './cut/cut.ts'
import { REDIS_CUT_FEATHER } from './cut/cut_feather.ts'
import { RAM_CUT_HDF5 } from './cut/cut_hdf5.ts'
import { REDIS_CUT_PARQUET } from './cut/cut_parquet.ts'
import { REDIS_DIFF } from './diff.ts'
import { REDIS_DIRNAME } from './dirname.ts'
import { REDIS_DU } from './du.ts'
import { REDIS_EXPAND } from './expand.ts'
import { REDIS_FILE } from './file/file.ts'
import { REDIS_FILE_FEATHER } from './file/file_feather.ts'
import { RAM_FILE_HDF5 } from './file/file_hdf5.ts'
import { REDIS_FILE_PARQUET } from './file/file_parquet.ts'
import { REDIS_FIND } from './find.ts'
import { REDIS_FMT } from './fmt.ts'
import { REDIS_FOLD } from './fold.ts'
import { REDIS_GREP } from './grep/grep.ts'
import { REDIS_GREP_FEATHER } from './grep/grep_feather.ts'
import { RAM_GREP_HDF5 } from './grep/grep_hdf5.ts'
import { REDIS_GREP_PARQUET } from './grep/grep_parquet.ts'
import { REDIS_GUNZIP } from './gunzip.ts'
import { REDIS_GZIP } from './gzip.ts'
import { REDIS_HEAD } from './head/head.ts'
import { REDIS_HEAD_FEATHER } from './head/head_feather.ts'
import { RAM_HEAD_HDF5 } from './head/head_hdf5.ts'
import { REDIS_HEAD_PARQUET } from './head/head_parquet.ts'
import { REDIS_ICONV } from './iconv.ts'
import { REDIS_JOIN } from './join.ts'
import { REDIS_JQ } from './jq.ts'
import { REDIS_LN } from './ln.ts'
import { REDIS_LOOK } from './look.ts'
import { REDIS_LS } from './ls/ls.ts'
import { REDIS_LS_FEATHER } from './ls/ls_feather.ts'
import { RAM_LS_HDF5 } from './ls/ls_hdf5.ts'
import { REDIS_LS_PARQUET } from './ls/ls_parquet.ts'
import { RAM_MD5 } from './md5.ts'
import { REDIS_MKDIR } from './mkdir.ts'
import { REDIS_MKTEMP } from './mktemp.ts'
import { REDIS_MV } from './mv.ts'
import { REDIS_NL } from './nl.ts'
import { REDIS_PASTE } from './paste.ts'
import { REDIS_PATCH } from './patch.ts'
import { REDIS_READLINK } from './readlink.ts'
import { REDIS_REALPATH } from './realpath.ts'
import { REDIS_REV } from './rev.ts'
import { REDIS_RG } from './rg.ts'
import { REDIS_RM } from './rm.ts'
import { REDIS_SED } from './sed.ts'
import { RAM_SHA256SUM } from './sha256sum.ts'
import { REDIS_SHUF } from './shuf.ts'
import { REDIS_SORT } from './sort.ts'
import { REDIS_SPLIT } from './split.ts'
import { REDIS_STAT } from './stat/stat.ts'
import { REDIS_STAT_FEATHER } from './stat/stat_feather.ts'
import { RAM_STAT_HDF5 } from './stat/stat_hdf5.ts'
import { REDIS_STAT_PARQUET } from './stat/stat_parquet.ts'
import { REDIS_STRINGS } from './strings.ts'
import { REDIS_TAC } from './tac.ts'
import { REDIS_TAIL } from './tail/tail.ts'
import { REDIS_TAIL_FEATHER } from './tail/tail_feather.ts'
import { RAM_TAIL_HDF5 } from './tail/tail_hdf5.ts'
import { REDIS_TAIL_PARQUET } from './tail/tail_parquet.ts'
import { REDIS_TAR } from './tar.ts'
import { REDIS_TEE } from './tee.ts'
import { REDIS_TOUCH } from './touch.ts'
import { REDIS_TR } from './tr.ts'
import { REDIS_TREE } from './tree.ts'
import { REDIS_TSORT } from './tsort.ts'
import { REDIS_UNEXPAND } from './unexpand.ts'
import { REDIS_UNIQ } from './uniq.ts'
import { REDIS_UNZIP } from './unzip.ts'
import { REDIS_WC } from './wc/wc.ts'
import { REDIS_WC_FEATHER } from './wc/wc_feather.ts'
import { RAM_WC_HDF5 } from './wc/wc_hdf5.ts'
import { REDIS_WC_PARQUET } from './wc/wc_parquet.ts'
import { REDIS_XXD } from './xxd.ts'
import { REDIS_ZCAT } from './zcat.ts'
import { REDIS_ZGREP } from './zgrep.ts'
import { REDIS_ZIP } from './zip_cmd.ts'

export const REDIS_COMMANDS: readonly RegisteredCommand[] = [
  ...REDIS_AWK,
  ...RAM_BASE64,
  ...REDIS_BASENAME,
  ...REDIS_CAT,
  ...REDIS_CAT_FEATHER,
  ...RAM_CAT_HDF5,
  ...REDIS_CAT_PARQUET,
  ...REDIS_CMP,
  ...REDIS_COLUMN,
  ...REDIS_COMM,
  ...REDIS_CP,
  ...REDIS_CSPLIT,
  ...REDIS_CUT,
  ...REDIS_CUT_FEATHER,
  ...RAM_CUT_HDF5,
  ...REDIS_CUT_PARQUET,
  ...REDIS_DIFF,
  ...REDIS_DIRNAME,
  ...REDIS_DU,
  ...REDIS_EXPAND,
  ...REDIS_FILE,
  ...REDIS_FILE_FEATHER,
  ...RAM_FILE_HDF5,
  ...REDIS_FILE_PARQUET,
  ...REDIS_FIND,
  ...REDIS_FMT,
  ...REDIS_FOLD,
  ...REDIS_GREP,
  ...REDIS_GREP_FEATHER,
  ...RAM_GREP_HDF5,
  ...REDIS_GREP_PARQUET,
  ...REDIS_GUNZIP,
  ...REDIS_GZIP,
  ...REDIS_HEAD,
  ...REDIS_HEAD_FEATHER,
  ...RAM_HEAD_HDF5,
  ...REDIS_HEAD_PARQUET,
  ...REDIS_ICONV,
  ...REDIS_JOIN,
  ...REDIS_JQ,
  ...REDIS_LN,
  ...REDIS_LOOK,
  ...REDIS_LS,
  ...REDIS_LS_FEATHER,
  ...RAM_LS_HDF5,
  ...REDIS_LS_PARQUET,
  ...RAM_MD5,
  ...REDIS_MKDIR,
  ...REDIS_MKTEMP,
  ...REDIS_MV,
  ...REDIS_NL,
  ...REDIS_PASTE,
  ...REDIS_PATCH,
  ...REDIS_READLINK,
  ...REDIS_REALPATH,
  ...REDIS_REV,
  ...REDIS_RG,
  ...REDIS_RM,
  ...REDIS_SED,
  ...RAM_SHA256SUM,
  ...REDIS_SHUF,
  ...REDIS_SORT,
  ...REDIS_SPLIT,
  ...REDIS_STAT,
  ...REDIS_STAT_FEATHER,
  ...RAM_STAT_HDF5,
  ...REDIS_STAT_PARQUET,
  ...REDIS_STRINGS,
  ...REDIS_TAC,
  ...REDIS_TAIL,
  ...REDIS_TAIL_FEATHER,
  ...RAM_TAIL_HDF5,
  ...REDIS_TAIL_PARQUET,
  ...REDIS_TAR,
  ...REDIS_TEE,
  ...REDIS_TOUCH,
  ...REDIS_TR,
  ...REDIS_TREE,
  ...REDIS_TSORT,
  ...REDIS_UNEXPAND,
  ...REDIS_UNIQ,
  ...REDIS_UNZIP,
  ...REDIS_WC,
  ...REDIS_WC_FEATHER,
  ...RAM_WC_HDF5,
  ...REDIS_WC_PARQUET,
  ...REDIS_XXD,
  ...REDIS_ZCAT,
  ...REDIS_ZGREP,
  ...REDIS_ZIP,
]
