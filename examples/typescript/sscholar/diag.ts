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

import { HttpSSCholarDriver } from '@struktoai/mirage-node'

const driver = new HttpSSCholarDriver({})
try {
  const r = await driver.searchPapers({
    fieldsOfStudy: 'Computer Science',
    year: '2024',
    limit: 5,
    sort: 'publicationDate:desc',
    fields: ['paperId', 'title', 'year'],
    query: '*',
  })
  console.log('total:', r.total, 'returned:', r.data.length)
  for (const p of r.data) console.log('  -', p.paperId, p.title?.slice(0, 60))
} catch (e) {
  console.log('ERROR:', e instanceof Error ? e.message : String(e))
}
