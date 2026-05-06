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
import { S3_AWK } from './awk.ts'
import { S3_BASE64 } from './base64_cmd.ts'
import { S3_BASENAME } from './basename.ts'
import { S3_CAT } from './cat.ts'
import { S3_CAT_FEATHER } from './cat/cat_feather.ts'
import { S3_CAT_HDF5 } from './cat/cat_hdf5.ts'
import { S3_CAT_PARQUET } from './cat/cat_parquet.ts'
import { S3_CMP } from './cmp.ts'
import { S3_COLUMN } from './column.ts'
import { S3_COMM } from './comm.ts'
import { S3_CP } from './cp.ts'
import { S3_CSPLIT } from './csplit.ts'
import { S3_CUT } from './cut.ts'
import { S3_CUT_FEATHER } from './cut/cut_feather.ts'
import { S3_CUT_HDF5 } from './cut/cut_hdf5.ts'
import { S3_CUT_PARQUET } from './cut/cut_parquet.ts'
import { S3_DIFF } from './diff.ts'
import { S3_DIRNAME } from './dirname.ts'
import { S3_DU } from './du.ts'
import { S3_EXPAND } from './expand.ts'
import { S3_FILE } from './file.ts'
import { S3_FILE_FEATHER } from './file/file_feather.ts'
import { S3_FILE_HDF5 } from './file/file_hdf5.ts'
import { S3_FILE_PARQUET } from './file/file_parquet.ts'
import { S3_FIND } from './find.ts'
import { S3_FMT } from './fmt.ts'
import { S3_FOLD } from './fold.ts'
import { S3_GREP } from './grep.ts'
import { S3_GREP_FEATHER } from './grep/grep_feather.ts'
import { S3_GREP_HDF5 } from './grep/grep_hdf5.ts'
import { S3_GREP_PARQUET } from './grep/grep_parquet.ts'
import { S3_GUNZIP } from './gunzip.ts'
import { S3_GZIP } from './gzip.ts'
import { S3_HEAD } from './head.ts'
import { S3_HEAD_FEATHER } from './head/head_feather.ts'
import { S3_HEAD_HDF5 } from './head/head_hdf5.ts'
import { S3_HEAD_PARQUET } from './head/head_parquet.ts'
import { S3_ICONV } from './iconv.ts'
import { S3_JOIN } from './join.ts'
import { S3_JQ } from './jq.ts'
import { S3_LN } from './ln.ts'
import { S3_LOOK } from './look.ts'
import { S3_LS } from './ls.ts'
import { S3_LS_FEATHER } from './ls/ls_feather.ts'
import { S3_LS_HDF5 } from './ls/ls_hdf5.ts'
import { S3_LS_PARQUET } from './ls/ls_parquet.ts'
import { S3_MD5 } from './md5.ts'
import { S3_MKDIR } from './mkdir.ts'
import { S3_MKTEMP } from './mktemp.ts'
import { S3_MV } from './mv.ts'
import { S3_NL } from './nl.ts'
import { S3_PASTE } from './paste.ts'
import { S3_PATCH } from './patch.ts'
import { S3_READLINK } from './readlink.ts'
import { S3_REALPATH } from './realpath.ts'
import { S3_REV } from './rev.ts'
import { S3_RG } from './rg.ts'
import { S3_RM } from './rm.ts'
import { S3_SED } from './sed.ts'
import { S3_SHA256SUM } from './sha256sum.ts'
import { S3_SHUF } from './shuf.ts'
import { S3_SORT } from './sort.ts'
import { S3_SPLIT } from './split.ts'
import { S3_STAT } from './stat.ts'
import { S3_STAT_FEATHER } from './stat/stat_feather.ts'
import { S3_STAT_HDF5 } from './stat/stat_hdf5.ts'
import { S3_STAT_PARQUET } from './stat/stat_parquet.ts'
import { S3_STRINGS } from './strings.ts'
import { S3_TAC } from './tac.ts'
import { S3_TAIL } from './tail.ts'
import { S3_TAIL_FEATHER } from './tail/tail_feather.ts'
import { S3_TAIL_HDF5 } from './tail/tail_hdf5.ts'
import { S3_TAIL_PARQUET } from './tail/tail_parquet.ts'
import { S3_TAR } from './tar.ts'
import { S3_TEE } from './tee.ts'
import { S3_TOUCH } from './touch.ts'
import { S3_TR } from './tr.ts'
import { S3_TREE } from './tree.ts'
import { S3_TSORT } from './tsort.ts'
import { S3_UNEXPAND } from './unexpand.ts'
import { S3_UNIQ } from './uniq.ts'
import { S3_UNZIP } from './unzip.ts'
import { S3_WC } from './wc.ts'
import { S3_WC_FEATHER } from './wc/wc_feather.ts'
import { S3_WC_HDF5 } from './wc/wc_hdf5.ts'
import { S3_WC_PARQUET } from './wc/wc_parquet.ts'
import { S3_XXD } from './xxd.ts'
import { S3_ZCAT } from './zcat.ts'
import { S3_ZGREP } from './zgrep.ts'
import { S3_ZIP } from './zip_cmd.ts'

export const S3_COMMANDS: readonly RegisteredCommand[] = [
  ...S3_AWK,
  ...S3_BASE64,
  ...S3_BASENAME,
  ...S3_CAT,
  ...S3_CAT_FEATHER,
  ...S3_CAT_HDF5,
  ...S3_CAT_PARQUET,
  ...S3_CMP,
  ...S3_COLUMN,
  ...S3_COMM,
  ...S3_CP,
  ...S3_CSPLIT,
  ...S3_CUT,
  ...S3_CUT_FEATHER,
  ...S3_CUT_HDF5,
  ...S3_CUT_PARQUET,
  ...S3_DIFF,
  ...S3_DIRNAME,
  ...S3_DU,
  ...S3_EXPAND,
  ...S3_FILE,
  ...S3_FILE_FEATHER,
  ...S3_FILE_HDF5,
  ...S3_FILE_PARQUET,
  ...S3_FIND,
  ...S3_FMT,
  ...S3_FOLD,
  ...S3_GREP,
  ...S3_GREP_FEATHER,
  ...S3_GREP_HDF5,
  ...S3_GREP_PARQUET,
  ...S3_GUNZIP,
  ...S3_GZIP,
  ...S3_HEAD,
  ...S3_HEAD_FEATHER,
  ...S3_HEAD_HDF5,
  ...S3_HEAD_PARQUET,
  ...S3_ICONV,
  ...S3_JOIN,
  ...S3_JQ,
  ...S3_LN,
  ...S3_LOOK,
  ...S3_LS,
  ...S3_LS_FEATHER,
  ...S3_LS_HDF5,
  ...S3_LS_PARQUET,
  ...S3_MD5,
  ...S3_MKDIR,
  ...S3_MKTEMP,
  ...S3_MV,
  ...S3_NL,
  ...S3_PASTE,
  ...S3_PATCH,
  ...S3_READLINK,
  ...S3_REALPATH,
  ...S3_REV,
  ...S3_RG,
  ...S3_RM,
  ...S3_SED,
  ...S3_SHA256SUM,
  ...S3_SHUF,
  ...S3_SORT,
  ...S3_SPLIT,
  ...S3_STAT,
  ...S3_STAT_FEATHER,
  ...S3_STAT_HDF5,
  ...S3_STAT_PARQUET,
  ...S3_STRINGS,
  ...S3_TAC,
  ...S3_TAIL,
  ...S3_TAIL_FEATHER,
  ...S3_TAIL_HDF5,
  ...S3_TAIL_PARQUET,
  ...S3_TAR,
  ...S3_TEE,
  ...S3_TOUCH,
  ...S3_TR,
  ...S3_TREE,
  ...S3_TSORT,
  ...S3_UNEXPAND,
  ...S3_UNIQ,
  ...S3_UNZIP,
  ...S3_WC,
  ...S3_WC_FEATHER,
  ...S3_WC_HDF5,
  ...S3_WC_PARQUET,
  ...S3_XXD,
  ...S3_ZCAT,
  ...S3_ZGREP,
  ...S3_ZIP,
]
