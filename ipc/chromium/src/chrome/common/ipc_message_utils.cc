/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "chrome/common/ipc_message_utils.h"
#include "mozilla/ipc/SharedMemory.h"

namespace IPC {

MessageBufferWriter::MessageBufferWriter(MessageWriter* writer,
                                         uint32_t full_len)
    : writer_(writer) {
  // NOTE: We only write out the `shmem_ok` bool if we're over
  // kMessageBufferShmemThreshold to avoid bloating the size of messages with
  // small buffers.
  if (full_len > kMessageBufferShmemThreshold) {
    shmem_ = new mozilla::ipc::SharedMemory();
    bool shmem_ok = shmem_->Create(full_len) && shmem_->Map(full_len);
    writer->WriteBool(shmem_ok);
    if (shmem_ok) {
      if (!shmem_->WriteHandle(writer)) {
        writer->FatalError("SharedMemory::WriteHandle failed");
        return;
      }
      buffer_ = reinterpret_cast<char*>(shmem_->Memory());
    } else {
      // Creating or mapping the shared memory region failed, perhaps due to FD
      // exhaustion or address space fragmentation. Fall back to trying to send
      // data inline.
      shmem_ = nullptr;
      writer->NoteLargeBufferShmemFailure(full_len);
    }
  }
  remaining_ = full_len;
}

MessageBufferWriter::~MessageBufferWriter() {
  if (remaining_ != 0) {
    writer_->FatalError("didn't fully write message buffer");
  }
}

bool MessageBufferWriter::WriteBytes(const void* data, uint32_t len) {
  MOZ_RELEASE_ASSERT(len == remaining_ || (len % 4) == 0,
                     "all writes except for the final write must be a multiple "
                     "of 4 bytes in length due to padding");
  if (len > remaining_) {
    writer_->FatalError("MessageBufferWriter overrun");
    return false;
  }
  remaining_ -= len;
  // If we're serializing using a shared memory region, `buffer_` will be
  // initialized to point into that region.
  if (buffer_) {
    memcpy(buffer_, data, len);
    buffer_ += len;
    return true;
  }
  return writer_->WriteBytes(data, len);
}

MessageBufferReader::MessageBufferReader(MessageReader* reader,
                                         uint32_t full_len)
    : reader_(reader) {
  // NOTE: We only write out the `shmem_ok` bool if we're over
  // kMessageBufferShmemThreshold to avoid bloating the size of messages with
  // small buffers.
  if (full_len > kMessageBufferShmemThreshold) {
    bool shmem_ok = false;
    if (!reader->ReadBool(&shmem_ok)) {
      reader->FatalError("MessageReader::ReadBool failed!");
      return;
    }
    if (shmem_ok) {
      shmem_ = new mozilla::ipc::SharedMemory();
      if (!shmem_->ReadHandle(reader)) {
        reader->FatalError("SharedMemory::ReadHandle failed!");
        return;
      }
      if (!shmem_->Map(full_len)) {
        reader->FatalError("SharedMemory::Map failed");
        return;
      }
      buffer_ = reinterpret_cast<const char*>(shmem_->Memory());
    }
  }
  remaining_ = full_len;
}

MessageBufferReader::~MessageBufferReader() {
  if (remaining_ != 0) {
    reader_->FatalError("didn't fully write message buffer");
  }
}

bool MessageBufferReader::ReadBytesInto(void* data, uint32_t len) {
  MOZ_RELEASE_ASSERT(len == remaining_ || (len % 4) == 0,
                     "all reads except for the final read must be a multiple "
                     "of 4 bytes in length due to padding");
  if (len > remaining_) {
    reader_->FatalError("MessageBufferReader overrun");
    return false;
  }
  remaining_ -= len;
  // If we're serializing using a shared memory region, `buffer_` will be
  // initialized to point into that region.
  if (buffer_) {
    memcpy(data, buffer_, len);
    buffer_ += len;
    return true;
  }
  return reader_->ReadBytesInto(data, len);
}

}  // namespace IPC
