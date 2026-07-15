"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  SiReact,
  SiNextdotjs,
  SiZod,
  SiShadcnui,
  SiMui,
  SiGreensock,
  SiTailwindcss,
  SiNodedotjs,
  SiExpress,
  SiPrisma,
  SiMongodb,
  SiJsonwebtokens,
  SiPostgresql,
  SiDocker,
  SiVercel,
  SiRender,
  SiJavascript,
  SiHtml5,
  SiTypescript,
  SiGithub,
  SiPostman,
  SiFigma,
  SiSocketdotio,
} from "react-icons/si";
import { FaAws, FaJava } from "react-icons/fa6";
import { IoInfinite } from "react-icons/io5";
import { TbBrandFramerMotion } from "react-icons/tb";
import { DiPhotoshop } from "react-icons/di";

gsap.registerPlugin(ScrollTrigger);

export default function MySkills() {
  const headingRef = useRef<HTMLDivElement>(null);
  const borderRef = useRef<HTMLDivElement>(null);
  const skillsBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (headingRef.current && borderRef.current) {
      const letters = headingRef.current.querySelectorAll(".heading-char");

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: headingRef.current,
          start: "top 85%",
          toggleActions: "play none none reverse",
        },
      });

      tl.fromTo(
        letters,
        { y: 50, opacity: 0, filter: "blur(5px)" },
        {
          y: 0,
          opacity: 1,
          filter: "blur(0px)",
          stagger: 0.08,
          ease: "back.out(1.7)",
          duration: 0.6,
        }
      );

      tl.fromTo(
        borderRef.current,
        { width: "0%" },
        { width: "100%", duration: 0.8, ease: "power2.out" },
        "-=0.3"
      );
    }
    const allSkillsBoxes = document.querySelectorAll(".skillsBox");
    allSkillsBoxes.forEach((box) => {
      const skills = box.querySelectorAll(".skill");
      gsap.fromTo(
        skills,
        { y: -40, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          stagger: 0.1,
          ease: "back.out(1.7)",
          scrollTrigger: {
            trigger: box,
            start: "top 80%",
            toggleActions: "play none none reverse",
          },
        }
      );
    });

    if (skillsBoxRef.current) {
      const AllskillSections =
        skillsBoxRef.current.querySelectorAll(".skillSection");
      AllskillSections.forEach((skillbox) => {
        const titleLetters = skillbox.querySelectorAll(".title-char");
        gsap.fromTo(
          titleLetters,
          { x: -20, opacity: 0, filter: "blur(5px)" },
          {
            x: 0,
            opacity: 1,
            filter: "blur(0px)",
            stagger: 0.05,
            ease: "back.out(1.7)",
            duration: 0.6,
            scrollTrigger: {
              trigger: titleLetters,
              start: "top 90%",
              toggleActions: "play none none reverse",
            },
          }
        );
      });
    }
  }, []);

  const text = "MY SKILLS";

  // ========== Skill Arrays ==========
  const frontEndSkills = [
    { name: "React", icon: SiReact },
    { name: "Next.js", icon: SiNextdotjs },
    { name: "Zod", icon: SiZod },
    { name: "Photoshop", icon: DiPhotoshop },
    { name: "Shadcn", icon: SiShadcnui },
    { name: "Material UI", icon: SiMui },
    { name: "GSAP", icon: SiGreensock },
    { name: "Framer Motion", icon: TbBrandFramerMotion },
    { name: "Tailwind CSS", icon: SiTailwindcss },
  ];

  const backEndSkills = [
    { name: "Node.js", icon: SiNodedotjs },
    { name: "Express.js", icon: SiExpress },
    { name: "Prisma ORM", icon: SiPrisma },
    { name: "Mongoose", icon: SiMongodb },
    { name: "Authentication", icon: SiJsonwebtokens },
    { name: "WebSockets", icon: SiSocketdotio },
    { name: "MongoDB", icon: SiMongodb },
    { name: "PostgreSQL", icon: SiPostgresql },
    { name: "AWS (S3)", icon: FaAws },
    { name: "Docker", icon: SiDocker },
    { name: "Vercel", icon: SiVercel },
    { name: "Render", icon: SiRender },
  ];

  const languageSkills = [
    { name: "Java", icon: FaJava },
    { name: "SQL (Postgres)", icon: SiPostgresql },
    { name: "JavaScript", icon: SiJavascript },
    { name: "HTML/CSS", icon: SiHtml5 },
    { name: "TypeScript", icon: SiTypescript },
  ];

  const toolsSkills = [
    { name: "GitHub", icon: SiGithub },
    { name: "CI/CD", icon: IoInfinite },
    { name: "Zustand", icon: SiReact }, // placeholder
    { name: "JWT Auth", icon: SiJsonwebtokens },
    { name: "VS Code", icon: SiReact }, // placeholder
    { name: "Postman", icon: SiPostman },
    { name: "Docker", icon: SiDocker },
    { name: "Figma", icon: SiFigma },
  ];

  // ========== Sections Config ==========
  const sections = [
    {
      id: 1,
      title: "Front-end Development",
      description:
        "This involves creating the user-facing side of applications, making sure everything looks clean, feels responsive, and works smoothly across devices.",
      skills: frontEndSkills,
    },
    {
      id: 2,
      title: "Back-end Development",
      description:
        "This involves building server-side logic, managing databases, handling authentication, optimizing performance, and deploying scalable applications on cloud platforms.",
      skills: backEndSkills,
    },
    {
      id: 3,
      title: "Languages",
      description:
        "Core programming and query languages I use to build strong foundations in both front-end and back-end systems.",
      skills: languageSkills,
    },
    {
      id: 4,
      title: "Tools and Workflow",
      description:
        "Using modern tools to collaborate efficiently, optimize workflows, and ship faster with reliable development, testing, and design practices.",
      skills: toolsSkills,
    },
  ];

  // ========== Reusable Render ==========
  const renderSkills = (skills: { name: string; icon: React.ElementType }[]) =>
    skills.map((skill, i) => (
      <span
        key={i}
        className="flex cursor-pointer duration-150 items-center skill gap-2 text-gray-100 bg-linear-to-br from-red-600/20 via-red-500/20 to-red-600/30 p-2 px-3 rounded-sm"
      >
        <skill.icon size={15} />
        {skill.name}
      </span>
    ));

  return (
    <div className="h-fit w-full relative pb-20">
      <div className="flex flex-col text-xs h-full w-full px-5">
        {/* Animated Heading */}
        <div className="relative w-full lg:w-[50%] my-2">
          <div
            ref={headingRef}
            className="text-[40px] lg:text-[80px] syncopate-regular text-gray-300 flex flex-wrap overflow-hidden"
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
          <div
            ref={borderRef}
            className="h-[2px] bg-red-800 absolute left-0 bottom-0"
            style={{ width: "0%" }}
          />
        </div>

        {/* Intro Paragraphs */}
        <div className="lg:p-8 text-[12px] lg:text-sm play-regular text-gray-100/80 w-full flex flex-col gap-5 ">
          <div className="w-full h-fit max-w-280 text-center mx-auto">
            I enjoy{" "}
            <span className="font-bold text-red-400/70">solving problems</span>{" "}
            and bringing ideas to life — from building smooth{" "}
            <span className="font-bold text-red-400/70">UIs</span> to wiring up
            the <span className="font-bold text-red-400/70">logic</span> behind
            them. I like{" "}
            <span className="font-bold text-red-400/70">experimenting</span>,
            learning new{" "}
            <span className="font-bold text-red-400/70">tools</span>, and making
            projects that feel both{" "}
            <span className="font-bold text-red-400/70">clean</span> and{" "}
            <span className="font-bold text-red-400/70">practical</span>.
            My focus is on creating reliable{" "}
            <span className="font-bold text-red-400/70">full-stack apps</span>,
            experimenting with{" "}
            <span className="font-bold text-red-400/70">
              real-time features
            </span>
            , handling{" "}
            <span className="font-bold text-red-400/70">auth flows</span> and{" "}
            <span className="font-bold text-red-400/70">state management</span>,
            and making sure every project balances{" "}
            <span className="font-bold text-red-400/70">performance</span> with
            a polished <span className="font-bold text-red-400/70">UI/UX</span>.
          </div>
        </div>

        {/* Sections */}
        <div
          ref={skillsBoxRef}
          className="h-fit w-full flex flex-col items-center justify-center mt-15"
        >
          {sections.map((section) => (
            <div
              key={section.id}
              className="w-full skillSection lg:w-280 max-w-500 h-fit flex flex-col lg:flex-row gap-2 lg:gap-8 lg:items-center justify-between items-start border-b-1 border-gray-400/20 py-8"
            >
              <div className="border-1 syncopate-regular border-red-800 rounded-[100%] size-8 lin lg:size-20 text-sm lg:text-[35px] font-light text-gray-200 flex justify-center items-center">
                {section.id}
              </div>
              <div className=" flex flex-col max-w-100 gap-1">
                <div className="play-regular leading-10 text-2xl lg:text-[35px] font-light text-gray-200 max-w-80">
                  {section.title.split(" ").map((word, wordIndex) => (
                    <span key={wordIndex} className="mr-1 inline-block">
                      {word.split("").map((char, charIndex) => (
                        <span
                          key={charIndex}
                          className="title-char inline-block overflow-hidden"
                        >
                          {char === " " ? "\u00A0" : char}
                        </span>
                      ))}
                    </span>
                  ))}
                </div>

                <div className="text-[8px] lg:text-[12px] play-regular text-gray-400 h-full flex">
                  {section.description}
                </div>
              </div>
              <div className="flex gap-3 skillsBox flex-wrap flex-row max-w-130 rounded-md justify-center p-3 text-sm h-fit">
                {renderSkills(section.skills)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
