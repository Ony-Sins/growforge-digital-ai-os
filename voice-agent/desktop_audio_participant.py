"""
NORA Desktop Audio Participant.
Captures real Windows microphone and plays LiveKit incoming audio to Windows speakers headlessly.
"""

import os
import sys
import math
import time
import struct
import asyncio
import logging
from typing import Optional, Callable
import livekit.rtc as rtc
from livekit import api

logger = logging.getLogger("DesktopAudioParticipant")

class DesktopAudioParticipant:
    def __init__(
        self,
        url: str = "ws://127.0.0.1:7880",
        api_key: str = "devkey",
        api_secret: str = "secret",
        room_name: str = "room_vs_headless_default",
        identity: str = "desktop_user_mic",
    ):
        self.url = url
        self.api_key = api_key
        self.api_secret = api_secret
        self.room_name = room_name
        self.identity = identity

        self.room: Optional[rtc.Room] = None
        self.media_devices = rtc.MediaDevices()
        self.input_capture: Optional[Any] = None
        self.output_player: Optional[Any] = None
        self.mic_track: Optional[rtc.LocalAudioTrack] = None

        self.is_running = False
        self.current_mic_rms = 0.0
        self.on_remote_audio_started: Optional[Callable[[], None]] = None
        self.on_remote_audio_stopped: Optional[Callable[[], None]] = None

    def _generate_token(self) -> str:
        token = (
            api.AccessToken(self.api_key, self.api_secret)
            .with_identity(self.identity)
            .with_name("Windows Desktop User")
            .with_grants(
                api.VideoGrants(
                    room_join=True,
                    room=self.room_name,
                    can_publish=True,
                    can_subscribe=True,
                    can_publish_data=True,
                )
            )
        )
        return token.to_jwt()

    async def start(self):
        logger.info(f"Connecting Desktop Audio Participant to {self.url} (Room: {self.room_name})...")
        self.room = rtc.Room()

        @self.room.on("track_subscribed")
        def on_track_subscribed(track: rtc.Track, publication: rtc.RemoteTrackPublication, participant: rtc.RemoteParticipant):
            if track.kind == rtc.TrackKind.KIND_AUDIO:
                logger.info(f"Subscribed to remote audio from {participant.identity}: {track.sid}")
                if self.output_player:
                    try:
                        self.output_player.add_track(track)
                        logger.info("Attached remote audio track to Windows speaker OutputPlayer.")
                        if self.on_remote_audio_started:
                            self.on_remote_audio_started()
                    except Exception as e:
                        logger.error(f"Failed to attach track to output player: {e}")

        @self.room.on("track_unsubscribed")
        def on_track_unsubscribed(track: rtc.Track, publication: rtc.RemoteTrackPublication, participant: rtc.RemoteParticipant):
            if track.kind == rtc.TrackKind.KIND_AUDIO and self.output_player:
                try:
                    self.output_player.remove_track(track)
                    logger.info("Removed track from speaker OutputPlayer.")
                    if self.on_remote_audio_stopped:
                        self.on_remote_audio_stopped()
                except Exception as e:
                    logger.warning(f"Error removing track: {e}")

        # Connect room
        jwt = self._generate_token()
        await self.room.connect(self.url, jwt)
        logger.info(f"Desktop Audio Participant connected (SID: {self.room.local_participant.sid}).")

        # Open real Windows speaker output
        try:
            self.output_player = self.media_devices.open_output()
            logger.info("Windows Speaker OutputPlayer initialized.")
        except Exception as e:
            logger.warning(f"Failed to open default audio output player: {e}")

        # Open real Windows microphone input with echo cancellation & noise suppression
        try:
            self.input_capture = self.media_devices.open_input(
                enable_aec=True,
                noise_suppression=True,
                auto_gain_control=True
            )
            self.mic_track = rtc.LocalAudioTrack.create_audio_track("microphone", self.input_capture.source)
            pub = await self.room.local_participant.publish_track(self.mic_track)
            logger.info(f"Published real Windows microphone track: {pub.sid}")
        except Exception as e:
            logger.error(f"Failed to open Windows microphone: {e}")
            raise e

        self.is_running = True

    async def stop(self):
        self.is_running = False
        if self.mic_track and self.room:
            try:
                await self.room.local_participant.unpublish_track(self.mic_track.sid)
            except Exception:
                pass

        if self.input_capture:
            try:
                await self.input_capture.aclose()
            except Exception:
                pass

        if self.output_player:
            try:
                await self.output_player.aclose()
            except Exception:
                pass

        if self.room:
            try:
                await self.room.disconnect()
            except Exception:
                pass

        logger.info("Desktop Audio Participant stopped cleanly.")
