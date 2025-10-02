"use client";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Image from "next/image";
import { useRef, useEffect } from "react";

gsap.registerPlugin(ScrollTrigger);

export default function AboutMe() {
  const headingRef = useRef<HTMLDivElement>(null);
  const borderRef = useRef<HTMLDivElement>(null);
  const galleryRef = useRef<HTMLDivElement>(null);
  const hobbyHeadingRef = useRef<HTMLDivElement>(null);
  const hobbyBorderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (headingRef.current && borderRef.current && galleryRef.current) {
      const q = gsap.utils.selector(galleryRef);

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: headingRef.current,
          start: "top 85%",
          toggleActions: "play none none reverse",
        },
      });

      // Heading letters
      tl.fromTo(
        headingRef.current.querySelectorAll(".heading-char"),
        { y: -50, opacity: 0, filter: "blur(5px)" },
        {
          y: 0,
          opacity: 1,
          filter: "blur(0px)",
          stagger: 0.08,
          ease: "back.out(1.7)",
          duration: 0.6,
        }
      );

      // Border line
      tl.fromTo(
        borderRef.current,
        { width: "0%" },
        { width: "100%", duration: 0.8, ease: "power2.out" },
        "-=0.3"
      );

      // Gallery images all in one go
      const galleryItems = [
        ...q(".PorfileImg"),
        ...q(".imageLC"),
        ...q(".imageRC"),
        ...q(".imageT"),
        ...q(".imageB"),
        ...q(".imageR"),
      ];

      tl.fromTo(
        galleryItems,
        {
          opacity: 0,
          filter: "blur(5px)",
          x: (i) => {
            // offsets per group
            if (galleryItems[i].classList.contains("PorfileImg")) return 0;
            if (galleryItems[i].classList.contains("imageLC")) return 150;
            if (galleryItems[i].classList.contains("imageRC")) return -150;
            if (galleryItems[i].classList.contains("imageR")) return -100;
            return 0;
          },
          y: (i) => {
            if (galleryItems[i].classList.contains("PorfileImg")) return 100;
            if (galleryItems[i].classList.contains("imageT")) return 50;
            if (galleryItems[i].classList.contains("imageB")) return -50;
            return 0;
          },
        },
        {
          opacity: 1,
          filter: "blur(0px)",
          x: 0,
          y: 0,
          ease: "circ.out",
          duration: 1.2,
          stagger: 0.2,
        }
      );
    }
    // 🔹 HOBBY animation
    if (hobbyHeadingRef.current && hobbyBorderRef.current) {
      const tl2 = gsap.timeline({
        scrollTrigger: {
          trigger: hobbyHeadingRef.current,
          start: "top 85%",
          toggleActions: "play none none reverse",
        },
      });

      // Hobby heading letters
      tl2.fromTo(
        hobbyHeadingRef.current.querySelectorAll(".hobby-char"),
        { y: -50, opacity: 0, filter: "blur(5px)" },
        {
          y: 0,
          opacity: 1,
          filter: "blur(0px)",
          stagger: 0.08,
          ease: "back.out(1.7)",
          duration: 0.6,
        }
      );

      // Hobby Border line
      tl2.fromTo(
        hobbyBorderRef.current,
        { width: "0%" },
        { width: "100%", duration: 0.8, ease: "power2.out" },
        "-=0.3"
      );
    }
  }, []);

  const text = "ABOUT ME";
  const hobbyText="MY HOBBIES"
  return (
    <div className="h-fit w-full relative pb-20 lg:mb-40">
      <div className="flex flex-col text-xs h-full w-full px-5">
        <div className="flex flex-col">
          <div className="flex flex-col">
            <div className="relative w-full lg:w-[50%] my-2">
              {/* Heading */}
              <div
                ref={headingRef}
                className="text-[40px] lg:text-[80px] syncopate-regular text-gray-100/80 flex flex-wrap overflow-hidden"
              >
                {text.split("").map((char, i) => (
                  <span
                    key={i}
                    className="heading-char inline-block overflow-hidden"
                  >
                    {char === " " ? "\u00A0" : char}
                  </span>
                ))}
              </div>
              {/* Border */}
              <div
                ref={borderRef}
                className="h-[2px] bg-red-800 absolute left-0 bottom-0"
                style={{ width: "0%" }}
              />
            </div>
          </div>

          {/* Gallery */}
          <div ref={galleryRef} className="h-fit w-full lg:p-2">
            <div className="h-200 w-230 absolute lg:flex hidden -z-1 flex-row gap-2 p-2">
              {/* Left Column */}
              <div className="flex-col items-center justify-center flex flex-4 blur-[2px] hover:blur-none">
                <div className="w-full h-120 justify-center flex-col flex gap-2">
                  <Image
                    className="ml-auto imageT size-40"
                    height={1000}
                    width={800}
                    alt=""
                    src={"/media/gallery/sketch.jpg"}
                  />
                  <Image
                    className="scale-100 imageLC opacity-80"
                    height={1000}
                    width={800}
                    alt=""
                    src={"/media/gallery/shadow.png"}
                  />
                  <Image
                    className="size-40 imageB ml-auto"
                    height={1000}
                    width={800}
                    alt=""
                    src={"/media/gallery/chess.png"}
                  />
                </div>
              </div>

              {/* Profile Image */}
              <div className="flex-col items-center justify-center flex flex-5">
                <div className="w-full bg-linear-to-b PorfileImg to-transparent via-white/30 from-transparent h-130 z-10 drop-shadow-2xl/90">
                  <Image
                    className="scale-130 "
                    height={1000}
                    width={800}
                    alt=""
                    src={"/media/gallery/profile.png"}
                    priority
                  />
                </div>
              </div>

              {/* Right Column */}
              <div className="flex-col items-center justify-center flex flex-4 blur-[2px] hover:blur-none">
                <div className="w-full h-120 flex flex-col gap-2 z-9">
                  <Image
                    className="aspect-square imageT size-25"
                    height={1000}
                    width={800}
                    alt=""
                    src={"/media/gallery/Broot.png"}
                  />
                  <Image
                    className="scale-100 imageRC w-full z-9"
                    height={1000}
                    width={800}
                    alt=""
                    src={"/media/gallery/Askull.jpg"}
                  />
                  <Image
                    className="h-40 w-30 imageB opacity-80"
                    height={1000}
                    width={800}
                    alt=""
                    src={"/media/gallery/image.jpg"}
                  />
                </div>
              </div>

              {/* Last Right Image */}
              <div className="flex-col items-center justify-center flex flex-2 blur-[2px] hover:blur-none -z-2">
                <div className="w-full h-30 -z-2">
                  <Image
                    className="scale-100 imageR -z-2"
                    height={1000}
                    width={800}
                    alt=""
                    src={"/media/gallery/sketch2.jpg"}
                  />
                </div>
              </div>
            </div>

            {/* About Text */}
            <div className="lg:p-8 text-[12px] lg:text-sm play-regular text-gray-100/80 w-full flex flex-col gap-5 z-10">
              <div className="max-w-[730px] w-full lg:w-[50%] h-fit ml-auto">
                {"Hi, I’m Arjit — a "}
                <span className="font-bold text-red-400/70">developer</span>
                {
                  " who enjoys turning ideas into working products. I’ve built projects ranging from a "
                }
                <span className="font-bold text-red-400/70">
                  multiplayer chess platform
                </span>
                {" with "}
                <span className="font-bold text-red-400/70">WebSockets</span>
                {" to a "}
                <span className="font-bold text-red-400/70">task manager</span>
                {" with "}
                <span className="font-bold text-red-400/70">AI features</span>
                {", and even some fun side projects like "}
                <span className="font-bold text-red-400/70">
                  mini piano games
                </span>
                {"."}
              </div>

              <div className="max-w-[730px] w-full lg:w-[50%] h-fit ml-auto">
                {"I like working across the stack — from "}
                <span className="font-bold text-red-400/70">
                  React/Next.js frontends
                </span>
                {" to "}
                <span className="font-bold text-red-400/70">
                  Node.js/Postgres backends
                </span>
                {" — and I enjoy experimenting with "}
                <span className="font-bold text-red-400/70">
                  real-time features
                </span>
                {", "}
                <span className="font-bold text-red-400/70">
                  authentication flows
                </span>
                {", and "}
                <span className="font-bold text-red-400/70">
                  clean UI design
                </span>
                {"."}
              </div>

              <Image
                className="scale-110 lg:hidden flex"
                height={1000}
                width={800}
                alt=""
                src={"/media/gallery/about.png"}
              />

              <div className="max-w-[500px] w-full lg:w-[50%] h-fit ml-auto lg:mt-15">
                <div className="relative w-full lg:w-[80%] ml-auto my-2">
                  <div
                    ref={hobbyHeadingRef}
                    className="text-[35px] lg:text-[40px] syncopate-regular text-gray-300 flex flex-wrap overflow-hidden text-right"
                  >
                    {hobbyText.split("").map((char, i) => (
                      <span
                        key={i}
                        className="hobby-char inline-block overflow-hidden"
                      >
                        {char === " " ? "\u00A0" : char}
                      </span>
                    ))}
                  </div>
                  <div
                    ref={hobbyBorderRef}
                    className="h-[2px] bg-red-800 absolute right-0 bottom-0"
                    style={{ width: "0%" }}
                  />
                </div>
                <div className="max-w-[700px] text-[12px] w-[80%] h-fit ml-auto lg:mt-5 mt-0">
                  {"Beyond coding, I spend time on my creative side — "}
                  <div className="font-bold text-red-400/70">- Gaming</div>
                  <div className="font-bold text-red-400/70">- Sketching</div>
                  <div className="font-bold text-red-400/70">
                    - Graphic designing
                  </div>
                  <div className="font-bold text-red-400/70">- Photoshop</div>
                  {
                    " I design my own interfaces and care about making apps that feel "
                  }
                  <span className="font-bold text-red-400/70">smooth</span>
                  {" and "}
                  <span className="font-bold text-red-400/70">intuitive.</span>
                  <div />
                  {" Right now, I’m looking for opportunities where I can "}
                  <span className="font-bold text-red-400/70">learn</span>
                  {", "}
                  <span className="font-bold text-red-400/70">grow</span>
                  {", and "}
                  <span className="font-bold text-red-400/70">contribute</span>
                  {" to real-world products."}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
